
import * as pdfjsLibProxy from 'pdfjs-dist';
import { ocrPDFPages } from '../services/geminiService';

// Fix: Handle different module export structures (ESM/CommonJS interop)
const pdfjsLib = (pdfjsLibProxy as any).default || pdfjsLibProxy;

export interface ExtractedPDFData {
  text: string;
  images: File[];
}

const pageToFile = async (page: any, pageNum: number): Promise<File | null> => {
    try {
        const viewport = page.getViewport({ scale: 1.8 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        await page.render({ canvasContext: ctx, viewport }).promise;
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
        canvas.width = 0;
        canvas.height = 0;
        return blob ? new File([blob], `pdf_page_${pageNum}_anexo.jpg`, { type: 'image/jpeg' }) : null;
    } catch (e) {
        console.warn(`Falha ao renderizar página ${pageNum} como anexo:`, e);
        return null;
    }
};

const looksLikePriceTable = (text: string) => {
    const normalized = text.toLowerCase();
    const priceMatches = text.match(/r\$\s*[\d.,]+/gi)?.length || 0;
    const tableWords = ['unidade', 'unid', 'valor', 'preço', 'preco', 'entrada', 'sinal', 'mensais', 'saldo', 'andar', 'coluna', 'área', 'area'];
    const wordHits = tableWords.filter((word) => normalized.includes(word)).length;
    return priceMatches >= 4 || (priceMatches >= 2 && wordHits >= 3);
};

// 1. Worker Initialization
const initPDFWorker = async () => {
    if (pdfjsLib.GlobalWorkerOptions.workerSrc) return; 
    const workerUrl = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    try {
        const response = await fetch(workerUrl);
        if (!response.ok) throw new Error("Falha ao baixar worker");
        const workerScript = await response.text();
        const blob = new Blob([workerScript], { type: "text/javascript" });
        pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
    } catch (e) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
    }
};

// --- ALGORITMO DE SEGMENTAÇÃO DE IMAGEM (SMART CROP) ---

const isContentRow = (data: Uint8ClampedArray, width: number, y: number, threshold: number = 240): boolean => {
    let contentPixels = 0;
    const step = 8;
    for (let x = 0; x < width; x += step) { 
        const idx = (y * width + x) * 4;
        if (idx + 2 >= data.length) continue;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        if (r < threshold || g < threshold || b < threshold) {
            contentPixels++;
        }
    }
    return contentPixels > (width / step) * 0.05; 
};

const isContentCol = (data: Uint8ClampedArray, width: number, height: number, x: number, yStart: number, yEnd: number, threshold: number = 240): boolean => {
    let contentPixels = 0;
    const scanHeight = yEnd - yStart;
    const step = 8;
    
    for (let y = yStart; y < yEnd; y += step) {
        const idx = (y * width + x) * 4;
        if (idx + 2 >= data.length) continue;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        if (r < threshold || g < threshold || b < threshold) {
            contentPixels++;
        }
    }
    return contentPixels > (scanHeight / step) * 0.05;
};

// Algoritmo XY-Cut Recursivo para separar Grid de Fotos
const segmentCanvas = async (canvas: HTMLCanvasElement, pageNum: number): Promise<File[]> => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];
    
    const width = canvas.width;
    const height = canvas.height;
    
    // Safety check para canvas vazio
    if (width === 0 || height === 0) return [];

    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    const extractedFiles: File[] = [];

    // 1. Scan Horizontal (Y-Axis) para achar linhas de fotos
    const rows: {start: number, end: number}[] = [];
    let inContent = false;
    let startY = 0;

    for (let y = 0; y < height; y++) {
        const hasContent = isContentRow(data, width, y);
        
        if (hasContent && !inContent) {
            inContent = true;
            startY = y;
        } else if (!hasContent && inContent) {
            inContent = false;
            if (y - startY > 50) {
                rows.push({ start: startY, end: y });
            }
        }
    }
    if (inContent && height - startY > 50) {
        rows.push({ start: startY, end: height });
    }

    // 2. Scan Vertical (X-Axis) DENTRO de cada linha para achar colunas
    for (const row of rows) {
        let inColContent = false;
        let startX = 0;
        
        for (let x = 0; x < width; x++) {
            const hasContent = isContentCol(data, width, height, x, row.start, row.end);

            if (hasContent && !inColContent) {
                inColContent = true;
                startX = x;
            } else if (!hasContent && inColContent) {
                inColContent = false;
                
                const w = x - startX;
                const h = row.end - row.start;
                
                if (w > 100 && h > 100) {
                    const cropCanvas = document.createElement('canvas');
                    cropCanvas.width = w;
                    cropCanvas.height = h;
                    const cropCtx = cropCanvas.getContext('2d');
                    if (cropCtx) {
                        cropCtx.drawImage(canvas, startX, row.start, w, h, 0, 0, w, h);
                        const blob = await new Promise<Blob | null>(r => cropCanvas.toBlob(r, 'image/jpeg', 0.9));
                        if (blob) {
                            extractedFiles.push(new File([blob], `pdf_crop_p${pageNum}_${startX}.jpg`, { type: 'image/jpeg' }));
                        }
                    }
                }
            }
        }
         // Fecha última coluna
         if (inColContent) {
            const w = width - startX;
            const h = row.end - row.start;
            if (w > 100 && h > 100) {
                const cropCanvas = document.createElement('canvas');
                cropCanvas.width = w;
                cropCanvas.height = h;
                const cropCtx = cropCanvas.getContext('2d');
                if (cropCtx) {
                    cropCtx.drawImage(canvas, startX, row.start, w, h, 0, 0, w, h);
                    const blob = await new Promise<Blob | null>(r => cropCanvas.toBlob(r, 'image/jpeg', 0.9));
                    if (blob) extractedFiles.push(new File([blob], `pdf_crop_p${pageNum}_last.jpg`, { type: 'image/jpeg' }));
                }
            }
        }
    }

    if (extractedFiles.length === 0) {
        const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.85));
        if (blob) return [new File([blob], `pdf_page_${pageNum}_full.jpg`, { type: 'image/jpeg' })];
    }

    return extractedFiles;
};

// 2. Render Page to Canvas
const renderPageAndSegment = async (page: any, pageNum: number): Promise<File[]> => {
    try {
        const viewport = page.getViewport({ scale: 1.0 }); 
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) return [];

        await page.render({ canvasContext: ctx, viewport: viewport }).promise;
        return await segmentCanvas(canvas, pageNum);

    } catch (e) {
        console.warn(`Falha na renderização/segmentação da página ${pageNum}:`, e);
    }
    return [];
};

const renderPageForOCR = async (page: any): Promise<string | null> => {
    try {
        const viewport = page.getViewport({ scale: 1.4 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');

        if (!ctx) return null;

        await page.render({ canvasContext: ctx, viewport }).promise;
        const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
        canvas.width = 0;
        canvas.height = 0;
        return dataUrl;
    } catch (e) {
        console.warn('Falha ao preparar página para OCR:', e);
        return null;
    }
};

// --- FUNÇÃO PRINCIPAL ---

export const extractDataFromPDF = async (pdfFile: File): Promise<ExtractedPDFData> => {
  await initPDFWorker();

  const arrayBuffer = await pdfFile.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  let fullText = '';
  const extractedImages: File[] = [];
  const ocrCandidates: { page: number; image: string }[] = [];
  const processedImageIds = new Set<string>();
  const renderedPages: File[] = [];

  // Helper de conversão direta
  const convertRawImageToFile = async (imgObj: any, pageNum: number, imgId: string): Promise<File | null> => {
      // Robustez: Verifica se imgObj e data existem
      if (!imgObj || !imgObj.data) return null;
      if (imgObj.width < 50 || imgObj.height < 50) return null; 

      try {
        const canvas = document.createElement('canvas');
        canvas.width = imgObj.width;
        canvas.height = imgObj.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        const imgData = ctx.createImageData(imgObj.width, imgObj.height);
        const rawData = imgObj.data;
        const targetData = imgData.data;
        
        if (rawData.length === targetData.length) {
             targetData.set(new Uint8ClampedArray(rawData));
        } else if (rawData.length === (imgObj.width * imgObj.height * 3)) {
            let j = 0;
            for(let i = 0; i < rawData.length; i += 3) {
                targetData[j++] = rawData[i];
                targetData[j++] = rawData[i+1];
                targetData[j++] = rawData[i+2];
                targetData[j++] = 255;
            }
        } else {
             return null;
        }

        ctx.putImageData(imgData, 0, 0);
        const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.95));
        if (blob) return new File([blob], `pdf_obj_p${pageNum}_${imgId}.jpg`, { type: 'image/jpeg' });
      } catch (e) {}
      return null;
  };

  // --- TRAVERSER ROBUSTO E RECURSIVO ---
  // Resolve o problema de "Cannot read properties of undefined (reading 'length')"
  const traverseOperatorList = async (operatorList: any, pageObjs: any, pageNum: number, depth: number = 0, extractedForPage: File[]) => {
      // Limite de profundidade para evitar travamento em PDFs circulares
      if (depth > 5) return;
      
      // Validação Crítica
      if (!operatorList || !operatorList.fn || !operatorList.args) return;
      
      const OPS = pdfjsLib.OPS;
      const fnArray = operatorList.fn;
      const argsArray = operatorList.args;

      // Valida se são arrays antes de tentar ler .length
      if (!Array.isArray(fnArray) || !Array.isArray(argsArray)) return;

      for (let i = 0; i < fnArray.length; i++) {
          try {
              const fn = fnArray[i];
              const args = argsArray[i];

              // 1. Imagem Direta
              if (fn === OPS.paintImageXObject) {
                  const imgName = args[0];
                  const uniqueKey = `${pageNum}-${imgName}`;
                  if (!processedImageIds.has(uniqueKey)) {
                      try {
                          const imgObj = await pageObjs.get(imgName);
                          if (imgObj) {
                              const file = await convertRawImageToFile(imgObj, pageNum, imgName);
                              if (file) {
                                  extractedForPage.push(file);
                                  processedImageIds.add(uniqueKey);
                              }
                          }
                      } catch (e) { /* ignore single image error */ }
                  }
              }
              // 2. Imagem Inline
              else if (fn === OPS.paintInlineImageXObject) {
                  try {
                       const imgObj = args[0];
                       const uniqueId = `inline_${Math.random().toString(36).substring(2,7)}`;
                       const file = await convertRawImageToFile(imgObj, pageNum, uniqueId);
                       if(file) extractedForPage.push(file);
                  } catch(e) {}
              }
              // 3. Recursão para Grupos/Formulários (XObject)
              else if (fn === OPS.paintXObject) {
                  const xObjName = args[0];
                  const visitedKey = `visited_xobj_${pageNum}-${xObjName}`;
                  if (processedImageIds.has(visitedKey)) continue;
                  processedImageIds.add(visitedKey);

                  try {
                      const xObj = await pageObjs.get(xObjName);
                      if (xObj) {
                          // Se tiver lista de operadores interna, mergulha nela
                          if (xObj.operatorList) {
                              await traverseOperatorList(xObj.operatorList, xObj.objs || pageObjs, pageNum, depth + 1, extractedForPage);
                          } 
                          // Se for um XObject de imagem mascarado
                          else if (xObj.data) {
                              const file = await convertRawImageToFile(xObj, pageNum, xObjName);
                              if (file) extractedForPage.push(file);
                          }
                      }
                  } catch(e) {}
              }

          } catch (opError) {
              // Catch individual operator error to prevent loop crash
              continue;
          }
      }
  };

  const pagePromises = [];
  
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      pagePromises.push((async () => {
          const page = await pdf.getPage(pageNum);
          let pageTextRaw = '';
          const extractedForPage: File[] = [];

          try {
              const textContent = await page.getTextContent();
              // @ts-ignore
              pageTextRaw = textContent.items.map((item: any) => item.str).join(' ');
              if (pageTextRaw.trim()) {
                  fullText += `\n--- Pág ${pageNum} ---\n${pageTextRaw}\n`;
              }
          } catch (e) {}

          const renderedPage = await pageToFile(page, pageNum);
          if (renderedPage) renderedPages.push(renderedPage);

          if (pageTextRaw.trim().length < 40 && ocrCandidates.length < 12) {
              const image = await renderPageForOCR(page);
              if (image) ocrCandidates.push({ page: pageNum, image });
          }

          // Tentativa 1: Extração Direta (Segura)
          try {
              const ops = await page.getOperatorList();
              const objs = page.objs || page.commonObjs;
              await traverseOperatorList(ops, objs, pageNum, 0, extractedForPage);
          } catch (e) {
              console.warn(`Erro não crítico ao ler operadores da pág ${pageNum}.`);
          }

          // LÓGICA HÍBRIDA MAIS INTELIGENTE: Se achou 0 imagens nativas e a página tem pouco texto,
          // usa Segmentação Visual. Pulamos páginas pesadas de texto para não sobrecarregar a CPU.
          if (extractedForPage.length === 0 && pageTextRaw.trim().length < 300) {
              console.log(`Página ${pageNum}: Pouco texto e 0 imagens. Analisando via Smart Crop...`);
              const segmentedFiles = await renderPageAndSegment(page, pageNum);
              if (segmentedFiles.length > 0) extractedForPage.push(...segmentedFiles);
          }
          
          return extractedForPage;
      })());
  }
  
  // Wait for all pages to be parsed concurrently (drastically speeds up processing)
  const results = await Promise.all(pagePromises);
  results.forEach(files => extractedImages.push(...files));

  if (ocrCandidates.length > 0) {
      const ocrText = await ocrPDFPages(ocrCandidates.sort((a, b) => a.page - b.page));
      if (ocrText.trim()) {
          fullText += `\n--- Texto OCR ---\n${ocrText}\n`;
      }
  }

  if (looksLikePriceTable(fullText)) {
      return {
          text: `--- TABELA DE VALORES ---
Material identificado como tabela de valores. Gere apenas uma capa curta com nome do empreendimento/imóvel, preço inicial se existir e uma observação: "Tabela completa em anexo". Não transcreva a tabela.`,
          images: renderedPages
      };
  }

  return { text: fullText, images: extractedImages };
};
