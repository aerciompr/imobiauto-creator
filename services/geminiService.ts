
import { GoogleGenAI, Type } from "@google/genai";
import OpenAI from "openai";
import { AIRealEstateContent, PropertyData } from "../types";

export const getAIConfig = () => {
    const provider = localStorage.getItem('ai_provider') || 'gemini';
    const openaiKey = localStorage.getItem('openai_api_key') || '';
    const customGeminiKey = localStorage.getItem('gemini_api_key') || '';
    return { provider, openaiKey, customGeminiKey };
};

const getAI = () => {
  const customKey = localStorage.getItem('gemini_api_key');
  const apiKey = customKey || ((window as any).ENV?.VITE_GEMINI_API_KEY && (window as any).ENV.VITE_GEMINI_API_KEY !== '__VITE_GEMINI_API_KEY__'
    ? (window as any).ENV.VITE_GEMINI_API_KEY
    : (import.meta as any).env.VITE_GEMINI_API_KEY || '');
  return new GoogleGenAI({ apiKey });
};

const sanitizeForPDF = (text: string | undefined | null): string => {
  if (!text) return "";
  return text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/—/g, '-')
    .replace(/–/g, '-')
    .replace(/\u00A0/g, ' ')
    .trim();
};

const SYSTEM_INSTRUCTION = `
Você é um Copywriter Imobiliário de Elite, focado em transformar dados brutos em fichas técnicas extensivas e luxuosas.
Sua missão primária é REPASSAR TODAS AS INFORMAÇÕES TÉCNICAS. Não presuma, não invente, apenas organize e aprimore o que lhe for dado.

DIRETRIZES RÍGIDAS DE QUALIDADE E PRESERVAÇÃO DE DADOS:
1. **EXAUSTIVIDADE (CRÍTICO):** O cliente exige absolutamente TUDO que houver no arquivo original na ficha gerada. Se houverem 50 itens de lazer, você deve colocar os 50 em uma lista. NÃO CORTAR NENHUMA INFORMAÇÃO.
2. **FIDELIDADE ABSOLUTA E ZERO ALUCINAÇÃO:** NUNCA invente ou adicione espaços de lazer (como Rooftop, Spa, Quadras) se não estiverem EXATAMENTE ESCRITOS E CONTEXTUALIZADOS no texto fonte. Use apenas os nomes exatos fornecidos. NÃO junte itens separados (ex: não crie "opção de rooftop e spa" se não estiver escrito assim).
3. **VOLUME E ESTRUTURA:** Use bastante texto nas descrições de "Sobre o Imóvel" e use enormes "Bullet points" (listas) para os itens e características técnicas. Quebre a resposta em pelo menos 3 a 4 seções grandes.
4. **TIPOLOGIAS E PLANTAS (CRÍTICO):** Sempre liste detalhadamente os tipos de unidades disponíveis (ex: 1 quarto, 2 suítes, etc) com suas respectivas metragens e características individuais (piscina privativa, garden, etc). NUNCA omita os tipos de plantas!
`;

// Helper to convert base64 data URL to Gemini Part
const imageToPart = (base64Data: string) => {
    return {
        inlineData: {
            data: base64Data.split(',')[1],
            mimeType: base64Data.split(';')[0].split(':')[1]
        }
    };
};

export const parseRawListing = async (rawText: string): Promise<PropertyData | null> => {
  try {
    const config = getAIConfig();
    const prompt = `
      Analise este texto bruto e extraia os dados do imóvel. 
      O texto pode ser um anúncio de marketing OU uma tabela de preços.
      
      REGRAS ESPECIAIS:
      1. Se houver múltiplos preços (tabela), identifique o MENOR valor e defina o campo 'price' como "A PARTIR DE R$ [valor]".
      2. NUNCA faça uma tabela de preços longa listando valores soltos de dezenas de unidades.
      3. CRÍTICO: Identifique e liste detalhadamente TODAS AS TIPOLOGIAS/PLANTAS do empreendimento (ex: quarto e sala, 2 suítes, metragens, diferenciais como piscina privativa ou garden) e coloque-as no campo 'features' ou 'description'. Não omita NENHUMA tipologia.
      4. CRÍTICO: Não omita nenhuma informação de lazer ou estrutura! Se o anúncio tem 50 características, ponha as 50 no campo 'features'.
      5. O que não for do imóvel (telefones de outros corretores, links) você remove. O resto MANTENHA.
      
      Texto: "${rawText}"
    `;

    let data: any = {};
    let useOpenAi = config.provider === 'openai' && !!config.openaiKey;

    if (useOpenAi) {
        try {
            const openai = new OpenAI({ apiKey: config.openaiKey, dangerouslyAllowBrowser: true });
            const jsonSchemaText = `
Retorne o resultado EXATAMENTE neste schema em formato JSON:
{
  "title": "",
  "price": "",
  "location": "",
  "features": "",
  "description": "",
  "units": [
    {
      "unit": "", "floor": "", "view": "", "area": "", "status": "", "price": "",
      "paymentPlan": { "ato": "", "sinal": "", "mensais": "", "semestrais": "", "financiamento": "" }
    }
  ],
  "aiContent": {
    "marketingTitle": "", "headline": "", "coverHighlights": ["", "", "", ""],
    "sections": [ { "title": "", "content": [""], "isList": false } ]
  }
}
            `;
            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: "Extraia os dados em JSON de acordo com o pedido. " + jsonSchemaText },
                    { role: "user", content: prompt }
                ],
                response_format: { type: "json_object" }
            });
            data = JSON.parse(response.choices[0].message.content || '{}');
        } catch (err) {
            console.warn("OpenAI API failed, falling back to Gemini", err);
            useOpenAi = false;
        }
    } 
    
    if (!useOpenAi) {
        const ai = getAI();
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-pro',
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                price: { type: Type.STRING },
                location: { type: Type.STRING },
                features: { type: Type.STRING },
                description: { type: Type.STRING },
                units: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      unit: { type: Type.STRING },
                      floor: { type: Type.STRING },
                      view: { type: Type.STRING },
                      area: { type: Type.STRING },
                      status: { type: Type.STRING },
                      price: { type: Type.STRING },
                      paymentPlan: {
                        type: Type.OBJECT,
                        properties: {
                          ato: { type: Type.STRING },
                          sinal: { type: Type.STRING },
                          mensais: { type: Type.STRING },
                          semestrais: { type: Type.STRING },
                          financiamento: { type: Type.STRING }
                        }
                      }
                    }
                  }
                },
                aiContent: {
                  type: Type.OBJECT,
                  properties: {
                    marketingTitle: { type: Type.STRING },
                    headline: { type: Type.STRING },
                    coverHighlights: { type: Type.ARRAY, items: { type: Type.STRING } },
                    sections: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          title: { type: Type.STRING },
                          content: { type: Type.ARRAY, items: { type: Type.STRING } },
                          isList: { type: Type.BOOLEAN }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        });
        data = JSON.parse(response.text || '{}');
    }

    return {
      title: sanitizeForPDF(data.title),
      price: sanitizeForPDF(data.price),
      location: sanitizeForPDF(data.location),
      features: sanitizeForPDF(data.features),
      description: sanitizeForPDF(data.description),
      units: data.units?.map((u: any) => ({
        ...u,
        unit: sanitizeForPDF(u.unit),
        floor: sanitizeForPDF(u.floor),
        view: sanitizeForPDF(u.view),
        area: sanitizeForPDF(u.area),
        status: sanitizeForPDF(u.status),
        price: sanitizeForPDF(u.price),
        paymentPlan: u.paymentPlan ? {
          ato: sanitizeForPDF(u.paymentPlan.ato),
          sinal: sanitizeForPDF(u.paymentPlan.sinal),
          mensais: sanitizeForPDF(u.paymentPlan.mensais),
          semestrais: sanitizeForPDF(u.paymentPlan.semestrais),
          financiamento: sanitizeForPDF(u.paymentPlan.financiamento)
        } : undefined
      })),
      aiContent: data.aiContent ? {
        marketingTitle: sanitizeForPDF(data.aiContent.marketingTitle),
        headline: sanitizeForPDF(data.aiContent.headline),
        coverHighlights: data.aiContent.coverHighlights?.map((h: any) => sanitizeForPDF(h)) || [],
        sections: data.aiContent.sections?.map((s: any) => ({
          ...s,
          title: sanitizeForPDF(s.title),
          content: s.content?.map((c: any) => sanitizeForPDF(c)) || []
        })) || [],
        locationHighlight: sanitizeForPDF(data.location)
      } : undefined
    };
  } catch (error) {
    console.error("Gemini Content Error:", error);
    return null;
  }
};

export const generatePDFContent = async (
    title: string, 
    location: string, 
    features: string, 
    description: string,
    images: string[] = [] 
): Promise<AIRealEstateContent | null> => {
  try {
    const config = getAIConfig();
    const parts: any[] = [];

    const textPrompt = `
      Gere o conteúdo da Ficha Técnica Imobiliária.
      
      INPUT:
      - Imóvel: ${title}
      - Local: ${location}
      - Dados: ${features}
      - Obs: ${description}

      ESTRUTURA OBRIGATÓRIA DO JSON:
      1. marketingTitle: Título Vendedor (Ex: "Mansão Suspensa no Horto").
      2. headline: Frase curta de impacto emocional.
      3. coverHighlights: Exatamente 4 destaques curtos (Ex: "Vista Mar", "4 Suítes").
      4. sections: (CRIE QUANTAS SEÇÕES FOREM NECESSÁRIAS PARA INCLUIR ABSOLUTAMENTE TUDO QUE FOI FORNECIDO NOS DADOS ACIMA)
         Exemplos de seções que você PODE e DEVE criar se houver dados para isso:
         - "Sobre o Empreendimento": TEXTO CORRIDO (MÍNIMO 3 PARÁGRAFOS).
         - "Localização Premium": TEXTO CORRIDO sobre o bairro.
         - "Tipologias e Plantas": LISTA DETALHADA com os tipos de apartamentos/casas, suas metragens (ex: 40m², 75m²) e pormenores exatos (ex: piscinas privativas, gardens, hidromassagem).
         - "Infraestrutura e Lazer": LISTA EXAUSTIVA com VÁRIOS BULLET POINTS contendo TODOS os itens do condomínio.
         - "Especificações Técnicas": LISTA com os materiais e acabamentos.

      REGRAS CRÍTICAS DE PRESERVAÇÃO DE DADOS:
      - ABSOLUTAMENTE NENHUMA INFORMAÇÃO CHAVE DEVE SER CORTADA. Identifique e cite todas as metragens e plantas.
      - NUNCA crie nada que não faça parte do conteúdo fornecido. APENAS aprimore a escrita do texto, mas os "fatos", "itens de lazer", "tamanhos" e "características" devem ser 100% fiéis ao que foi enviado.
    `;

    parts.push({ text: textPrompt });
    let data: any = {};
    let useOpenAi = config.provider === 'openai' && !!config.openaiKey;

    if (useOpenAi) {
        try {
            const openai = new OpenAI({ apiKey: config.openaiKey, dangerouslyAllowBrowser: true });
            
            const jsonSchemaText = `
Retorne o resultado EXATAMENTE neste schema em formato JSON:
{
  "marketingTitle": "",
  "headline": "",
  "coverHighlights": ["", "", "", ""],
  "sections": [ { "title": "", "content": ["", ""], "isList": false } ]
}
            `;

            const response = await openai.chat.completions.create({
                model: "gpt-4o", // Using gpt-4o here for better writing vs 4o-mini
                messages: [
                    { role: "system", content: SYSTEM_INSTRUCTION + "\n\nResponda APENAS com um objeto JSON correspondendo à ESTRUTURA OBRIGATÓRIA solicitada. " + jsonSchemaText },
                    { role: "user", content: textPrompt }
                ],
                response_format: { type: "json_object" }
            });
            data = JSON.parse(response.choices[0].message.content || '{}');
        } catch (err) {
            console.warn("OpenAI API failed, falling back to Gemini", err);
            useOpenAi = false;
        }
    } 
    
    if (!useOpenAi) {
        const ai = getAI();
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-pro', 
          contents: { parts: parts },
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                marketingTitle: { type: Type.STRING },
                headline: { type: Type.STRING },
                coverHighlights: { type: Type.ARRAY, items: { type: Type.STRING } },
                sections: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      content: { type: Type.ARRAY, items: { type: Type.STRING } },
                      isList: { type: Type.BOOLEAN }
                    }
                  }
                }
              }
            }
          }
        });
        data = JSON.parse(response.text || '{}');
    }

    return {
      marketingTitle: sanitizeForPDF(data.marketingTitle),
      headline: sanitizeForPDF(data.headline),
      coverHighlights: data.coverHighlights?.map((h: any) => sanitizeForPDF(h)) || [],
      sections: data.sections?.map((s: any) => ({
        ...s,
        title: sanitizeForPDF(s.title),
        content: s.content?.map((c: any) => sanitizeForPDF(c)) || []
      })) || [],
      locationHighlight: sanitizeForPDF(location)
    };
  } catch (error) {
    console.error("Gemini PDF Content Gen Error:", error);
    return null;
  }
};

export const enhanceImageWithAI = async (base64Image: string): Promise<string | null> => {
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          { inlineData: { data: base64Image.split(',')[1], mimeType: 'image/jpeg' } },
          { text: 'Improve lighting, color balance and sharpness of this real estate photo. Keep it realistic.' }
        ]
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/jpeg;base64,${part.inlineData.data}`;
    }
    return null;
  } catch (error) {
    return null;
  }
};

export const filterRealEstateImages = async (base64Images: string[]): Promise<number[]> => {
  if (base64Images.length === 0) return [];
  
  try {
    const ai = getAI();
    const parts: any[] = [];
    
    base64Images.forEach((base64, index) => {
      parts.push({ text: `Imagem ${index}:` });
      parts.push({
        inlineData: {
          data: base64.split(',')[1],
          mimeType: 'image/jpeg'
        }
      });
    });

    parts.push({
      text: `
        Analise estas imagens de um lote de arquivos imobiliários.
        Identifique APENAS as fotos reais do imóvel (interiores, fachada, áreas comuns, lazer, vista).
        
        IGNORE E REJEITE:
        - Logotipos de construtoras ou imobiliárias.
        - Fotos de texturas (amostras de piso, parede, tecidos).
        - Gráficos de marketing, plantas baixas humanizadas ou diagramas.
        - Fotos de pessoas ou equipe.
        - Fotos repetidas ou muito similares.
        
        Retorne um JSON com o array 'validIndices' contendo os números das imagens que devem ser mantidas.
      `
    });

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            validIndices: {
              type: Type.ARRAY,
              items: { type: Type.INTEGER }
            }
          },
          required: ["validIndices"]
        }
      }
    });

    const result = JSON.parse(response.text || '{"validIndices": []}');
    return result.validIndices || [];
  } catch (error) {
    console.error("Filter Images Error:", error);
    // If AI fails, return all indices as fallback to avoid losing data
    return base64Images.map((_, i) => i);
  }
};

export const rankRealEstateImages = async (base64Images: string[]): Promise<number[]> => {
  if (base64Images.length === 0) return [];
  
  try {
    const ai = getAI();
    const parts: any[] = [];
    
    base64Images.forEach((base64, index) => {
      parts.push({ text: `Imagem ${index}:` });
      parts.push({
        inlineData: {
          data: base64.split(',')[1],
          mimeType: 'image/jpeg'
        }
      });
    });

    parts.push({
      text: `
        Ordene estas imagens imobiliárias da mais importante para a menos importante para um anúncio de venda.
        
        CRITÉRIOS DE ORDENAÇÃO:
        1. Fachada Principal ou Vista Principal (A "Foto de Capa").
        2. Sala de Estar / Áreas Sociais amplas.
        3. Cozinha / Área Gourmet.
        4. Suíte Principal / Quartos.
        5. Banheiros / Áreas de Serviço.
        6. Detalhes menores.
        
        Retorne um JSON com o array 'sortedIndices' contendo os números das imagens na ordem sugerida.
      `
    });

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            sortedIndices: {
              type: Type.ARRAY,
              items: { type: Type.INTEGER }
            }
          },
          required: ["sortedIndices"]
        }
      }
    });

    const result = JSON.parse(response.text || '{"sortedIndices": []}');
    return result.sortedIndices || [];
  } catch (error) {
    console.error("Rank Images Error:", error);
    return base64Images.map((_, i) => i);
  }
};
