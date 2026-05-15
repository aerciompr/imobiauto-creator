import { createServer } from "node:http";
import { existsSync, createReadStream, readFileSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootDir = resolve(__dirname, "..");
const distDir = resolve(rootDir, "dist");

const loadDotEnv = () => {
  const envPath = join(rootDir, ".env");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
};

loadDotEnv();

const port = Number(process.env.PORT || 80);

const OPENAI_TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || "gpt-4.1";
const OPENAI_FAST_MODEL = process.env.OPENAI_FAST_MODEL || "gpt-4.1-mini";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.API_KEY || "";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp"
};

const SYSTEM_INSTRUCTION = `
Você organiza material imobiliário para uma ficha comercial premium, curta e legível.
Sua prioridade é harmonia editorial: preservar informações, mas separar resumo comercial de anexo técnico.

REGRAS:
1. Não invente espaços, comodidades, vistas, metragens, preços ou condições.
2. O conteúdo principal deve ser objetivo, com frases curtas e sem repetição.
3. A capa/ficha comercial deve caber em uma página; detalhes realmente extensos vão em technicalAppendix.
4. Se houver muitos itens de lazer, agrupe em bullets objetivos.
5. Remova telefones de terceiros e links irrelevantes, mas preserve dados úteis do imóvel.
`;

const sectionSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    content: { type: "array", items: { type: "string" } },
    isList: { type: "boolean" }
  }
};

const propertySchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    price: { type: "string" },
    location: { type: "string" },
    features: { type: "string" },
    description: { type: "string" },
    units: {
      type: "array",
      items: {
        type: "object",
        properties: {
          unit: { type: "string" },
          floor: { type: "string" },
          view: { type: "string" },
          area: { type: "string" },
          status: { type: "string" },
          price: { type: "string" },
          paymentPlan: {
            type: "object",
            properties: {
              ato: { type: "string" },
              sinal: { type: "string" },
              mensais: { type: "string" },
              semestrais: { type: "string" },
              financiamento: { type: "string" }
            }
          }
        }
      }
    },
    aiContent: {
      type: "object",
      properties: {
        marketingTitle: { type: "string" },
        headline: { type: "string" },
        coverHighlights: { type: "array", items: { type: "string" } },
        sections: { type: "array", items: sectionSchema },
        technicalAppendix: { type: "array", items: sectionSchema },
        locationHighlight: { type: "string" }
      }
    }
  }
};

const contentSchema = {
  type: "object",
  properties: {
    marketingTitle: { type: "string" },
    headline: { type: "string" },
    coverHighlights: { type: "array", items: { type: "string" } },
    sections: { type: "array", items: sectionSchema },
    technicalAppendix: { type: "array", items: sectionSchema },
    locationHighlight: { type: "string" }
  }
};

const sendJSON = (res, status, payload) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
};

const readJSONBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
};

const sendBuffer = (res, status, buffer, contentType, fileName) => {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Content-Length": buffer.length,
    ...(fileName ? { "Content-Disposition": `attachment; filename="${fileName}"` } : {})
  });
  res.end(buffer);
};

const safeFileName = (name) => String(name || "Ficha_Imovel")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-zA-Z0-9_-]+/g, "_")
  .replace(/^_+|_+$/g, "")
  .slice(0, 48) || "Ficha_Imovel";

const buildPDFHTML = (bodyHTML) => `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box; }
    html, body { margin: 0 !important; padding: 0 !important; width: 210mm; background: white !important; font-family: Inter, Arial, sans-serif; }
    .pdf-page {
      width: 210mm !important;
      min-width: 210mm !important;
      max-width: 210mm !important;
      height: 297mm !important;
      min-height: 297mm !important;
      max-height: 297mm !important;
      margin: 0 !important;
      box-shadow: none !important;
      break-after: page;
      page-break-after: always;
      overflow: hidden !important;
    }
    .pdf-page:last-child { break-after: auto; page-break-after: auto; }
  </style>
</head>
<body>${bodyHTML}</body>
</html>`;

const renderPDF = async (html, fileName) => {
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium-browser";
  const browser = await puppeteer.launch({
    executablePath,
    headless: "new",
    timeout: 0,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
    await page.setContent(buildPDFHTML(html), { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.evaluate(() => document.fonts?.ready);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const buffer = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
      displayHeaderFooter: false
    });
    return { buffer, fileName: `${safeFileName(fileName)}.pdf` };
  } finally {
    await browser.close();
  }
};

const requireOpenAI = () => {
  if (!OPENAI_API_KEY) {
    const error = new Error("OPENAI_API_KEY ou API_KEY não configurada no servidor.");
    error.status = 500;
    throw error;
  }
  return OPENAI_API_KEY;
};

const imageToInput = (base64Data) => ({
  type: "input_image",
  image_url: String(base64Data || ""),
  detail: "low"
});

const extractOpenAIText = (payload) => {
  if (payload.output_text) return payload.output_text;
  const parts = [];
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) parts.push(content.text);
      if (content.type === "text" && content.text) parts.push(content.text);
    }
  }
  return parts.join("\n");
};

const openAIResponse = async ({ model, input, instructions, schema, schemaName }) => {
  const apiKey = requireOpenAI();
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      instructions,
      input,
      ...(schema ? {
        text: {
          format: {
            type: "json_schema",
            name: schemaName,
            schema,
            strict: false
          }
        }
      } : {})
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.error?.message || "Falha ao chamar OpenAI.";
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return extractOpenAIText(payload);
};

const parseModelJSON = (text) => JSON.parse(text || "{}");

const sendStructuredOpenAI = async ({ model = OPENAI_TEXT_MODEL, prompt, schema, schemaName, content = [] }) => {
  const text = await openAIResponse({
    model,
    instructions: SYSTEM_INSTRUCTION,
    schema,
    schemaName,
    input: [{
      role: "user",
      content: [
        { type: "input_text", text: prompt },
        ...content
      ]
    }]
  });

  return parseModelJSON(text);
};

const normalizeAIPath = (pathname) => pathname.replace(/^\/api\/gemini\//, "/api/openai/");

const handleOpenAIRoute = async (req, res, pathname) => {
  if (req.method !== "POST") return sendJSON(res, 405, { error: "Método não permitido." });

  pathname = normalizeAIPath(pathname);
  const body = await readJSONBody(req);

  if (pathname === "/api/openai/parse-listing") {
    const rawText = String(body.rawText || "").trim();
    if (!rawText) return sendJSON(res, 400, { error: "Texto vazio." });

    const prompt = `
Analise este texto bruto e extraia os dados do imóvel.

REGRAS:
1. Preço inteligente:
   - Se for casa, cobertura, apartamento específico, unidade única ou imóvel usado com um único valor, use o campo price apenas como "R$ [valor]". Nunca coloque "A PARTIR DE".
   - Use "A PARTIR DE R$ [valor]" somente para lançamento/empreendimento/tabela com múltiplas unidades ou quando o texto disser explicitamente "a partir de".
   - Se não houver preço, use "Sob consulta".
2. Não crie tabela longa de preços soltos.
3. Liste todas as tipologias/plantas, metragens e diferenciais.
4. Preserve lazer, estrutura e informações técnicas, mas organize o excesso em aiContent.technicalAppendix.
5. Remova telefones de terceiros e links irrelevantes, mas preserve dados do imóvel.
6. aiContent.sections deve ser curto: no máximo 3 seções, cada uma com até 4 bullets ou 1 parágrafo.

Texto:
${rawText}
`;

    const data = await sendStructuredOpenAI({
      prompt,
      schema: propertySchema,
      schemaName: "property_listing"
    });

    return sendJSON(res, 200, data);
  }

  if (pathname === "/api/openai/generate-content") {
    const { title = "", location = "", features = "", description = "", images = [] } = body;
    const prompt = `
Gere o conteúdo da Ficha Técnica Imobiliária.

INPUT:
- Imóvel: ${title}
- Local: ${location}
- Dados: ${features}
- Obs: ${description}

ESTRUTURA:
1. marketingTitle: título vendedor.
2. headline: frase curta de impacto.
3. coverHighlights: exatamente 4 destaques curtos.
4. sections: conteúdo principal curto, no máximo 3 seções.
5. technicalAppendix: detalhes técnicos longos, tabelas, muitas plantas ou listas extensas.

REGRAS:
- marketingTitle até 70 caracteres.
- marketingTitle deve ser natural, sem excesso de adjetivos, sem repetir condomínio/bairro se isso deixar o título longo.
- Para casa/unidade única, prefira título no formato: "[Tipo] no [Condomínio/Bairro] com [principal diferencial]".
- Para lançamento/empreendimento, prefira título no formato: "[Empreendimento] - [principal promessa/localização]".
- headline até 100 caracteres.
- coverHighlights com exatamente 4 itens de até 28 caracteres.
- sections deve ser limpo e comercial, com até 1.250 caracteres somados.
- cada seção principal deve ter título curto e até 4 bullets; use parágrafo só se for indispensável.
- technicalAppendix preserva metragens, plantas, lazer, acabamentos, preços e características que não couberem no resumo.
- Não invente fatos. Fotos servem apenas para coerência visual, nunca para criar informações técnicas.
`;

    const imageInputs = images.slice(0, 3).map((image) => imageToInput(image));

    const data = await sendStructuredOpenAI({
      prompt,
      schema: contentSchema,
      schemaName: "property_pdf_content",
      content: imageInputs
    });

    return sendJSON(res, 200, data);
  }

  if (pathname === "/api/openai/enhance-image") {
    const image = String(body.image || "");
    if (!image) return sendJSON(res, 400, { error: "Imagem vazia." });

    return sendJSON(res, 200, { image: null, notice: "Melhoria de imagem desativada no modo OpenAI." });
  }

  if (pathname === "/api/openai/ocr-pages") {
    const pages = Array.isArray(body.pages)
      ? body.pages.filter((page) => String(page.image || "").startsWith("data:image/")).slice(0, 12)
      : [];
    if (pages.length === 0) return sendJSON(res, 400, { error: "Nenhuma página enviada para OCR." });

    const prompt = `Extraia todo texto legível destas páginas de PDF/imagem em português.
Retorne apenas JSON no formato {"text":"..."}.
Preserve preços, metragens, nomes de áreas, condições de pagamento e observações.
Não descreva imagens quando não houver texto visível. Separe cada página com o marcador "--- Pág X OCR ---".`;

    const content = [];
    pages.forEach((page) => {
      content.push({ type: "input_text", text: `--- Pág ${page.page} OCR ---` });
      content.push(imageToInput(String(page.image || "")));
    });

    const data = await sendStructuredOpenAI({
      model: OPENAI_FAST_MODEL,
      prompt,
      content,
      schemaName: "ocr_result",
      schema: {
        type: "object",
        properties: {
          text: { type: "string" }
        },
        required: ["text"]
      }
    });

    return sendJSON(res, 200, data);
  }

  if (pathname === "/api/openai/filter-images" || pathname === "/api/openai/rank-images") {
    const images = Array.isArray(body.images) ? body.images : [];
    const field = pathname.endsWith("filter-images") ? "validIndices" : "sortedIndices";
    const prompt = pathname.endsWith("filter-images")
      ? "Identifique apenas fotos reais do imóvel. Ignore logotipos, plantas, texturas, gráficos, pessoas e repetidas. Retorne JSON com validIndices."
      : "Ordene imagens imobiliárias da mais importante para anúncio até a menos importante. Retorne JSON com sortedIndices.";

    const content = [];
    images.forEach((image, index) => {
      content.push({ type: "input_text", text: `Imagem ${index}:` });
      content.push(imageToInput(image));
    });

    const data = await sendStructuredOpenAI({
      model: OPENAI_FAST_MODEL,
      prompt,
      content,
      schemaName: field,
      schema: {
        type: "object",
        properties: {
          [field]: { type: "array", items: { type: "integer" } }
        },
        required: [field]
      }
    });

    return sendJSON(res, 200, data);
  }

  return sendJSON(res, 404, { error: "Rota de OpenAI não encontrada." });
};

const handlePDFRoute = async (req, res, pathname) => {
  if (pathname !== "/api/pdf/render") return sendJSON(res, 404, { error: "Rota de PDF não encontrada." });
  if (req.method !== "POST") return sendJSON(res, 405, { error: "Método não permitido." });

  const body = await readJSONBody(req);
  const html = String(body.html || "").trim();
  if (!html || !html.includes("pdf-page")) return sendJSON(res, 400, { error: "HTML do PDF inválido." });

  const { buffer, fileName } = await renderPDF(html, body.fileName || "Ficha_Imovel");
  return sendBuffer(res, 200, buffer, "application/pdf", fileName);
};

const serveStatic = async (req, res, pathname) => {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const targetPath = normalize(join(distDir, requestedPath));

  if (!targetPath.startsWith(distDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  const filePath = existsSync(targetPath) ? targetPath : join(distDir, "index.html");
  const ext = extname(filePath);

  res.writeHead(200, {
    "Content-Type": mimeTypes[ext] || "application/octet-stream",
    "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable"
  });
  createReadStream(filePath).pipe(res);
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (url.pathname === "/health") return sendJSON(res, 200, { ok: true });
    if (url.pathname.startsWith("/api/pdf/")) return await handlePDFRoute(req, res, url.pathname);
    if (url.pathname.startsWith("/api/openai/") || url.pathname.startsWith("/api/gemini/")) {
      return await handleOpenAIRoute(req, res, url.pathname);
    }

    return await serveStatic(req, res, url.pathname);
  } catch (error) {
    console.error(error);
    sendJSON(res, error.status || 500, { error: error.message || "Erro interno." });
  }
});

if (!existsSync(join(distDir, "index.html"))) {
  console.warn("Aviso: dist/index.html não encontrado. Rode npm run build antes de npm start.");
}

server.listen(port, "0.0.0.0", () => {
  console.log(`ImobiAuto rodando em http://0.0.0.0:${port}`);
});
