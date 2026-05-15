import { AIRealEstateContent, PropertyData } from "../types";

const sanitizeForPDF = (text: string | undefined | null): string => {
  if (!text) return "";
  return text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/—/g, "-")
    .replace(/–/g, "-")
    .replace(/\u00A0/g, " ")
    .trim();
};

const postJSON = async <T>(path: string, body: unknown): Promise<T> => {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Falha ao chamar o serviço de IA.");
  }

  return payload as T;
};

const normalizePropertyData = (data: any): PropertyData => ({
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
  aiContent: data.aiContent ? normalizeAIContent(data.aiContent, data.location) : undefined
});

const normalizeAIContent = (data: any, location = ""): AIRealEstateContent => ({
  marketingTitle: sanitizeForPDF(data.marketingTitle),
  headline: sanitizeForPDF(data.headline),
  coverHighlights: data.coverHighlights?.map((h: any) => sanitizeForPDF(h)) || [],
  sections: data.sections?.map((s: any) => ({
    ...s,
    title: sanitizeForPDF(s.title),
    content: s.content?.map((c: any) => sanitizeForPDF(c)) || []
  })) || [],
  technicalAppendix: data.technicalAppendix?.map((s: any) => ({
    ...s,
    title: sanitizeForPDF(s.title),
    content: s.content?.map((c: any) => sanitizeForPDF(c)) || []
  })) || [],
  locationHighlight: sanitizeForPDF(data.locationHighlight || location)
});

export const parseRawListing = async (rawText: string): Promise<PropertyData | null> => {
  try {
    const data = await postJSON<any>("/api/openai/parse-listing", { rawText });
    return normalizePropertyData(data);
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
    const data = await postJSON<any>("/api/openai/generate-content", {
      title,
      location,
      features,
      description,
      images: images.slice(0, 3)
    });

    return normalizeAIContent(data, location);
  } catch (error) {
    console.error("Gemini PDF Content Gen Error:", error);
    return null;
  }
};

export const enhanceImageWithAI = async (base64Image: string): Promise<string | null> => {
  try {
    const data = await postJSON<{ image: string | null }>("/api/openai/enhance-image", { image: base64Image });
    return data.image;
  } catch (error) {
    console.error("Enhance Image Error:", error);
    return null;
  }
};

export const filterRealEstateImages = async (base64Images: string[]): Promise<number[]> => {
  if (base64Images.length === 0) return [];

  try {
    const data = await postJSON<{ validIndices: number[] }>("/api/openai/filter-images", { images: base64Images });
    return data.validIndices || [];
  } catch (error) {
    console.error("Filter Images Error:", error);
    return base64Images.map((_, i) => i);
  }
};

export const rankRealEstateImages = async (base64Images: string[]): Promise<number[]> => {
  if (base64Images.length === 0) return [];

  try {
    const data = await postJSON<{ sortedIndices: number[] }>("/api/openai/rank-images", { images: base64Images });
    return data.sortedIndices || [];
  } catch (error) {
    console.error("Rank Images Error:", error);
    return base64Images.map((_, i) => i);
  }
};

export const ocrPDFPages = async (pages: { page: number; image: string }[]): Promise<string> => {
  if (pages.length === 0) return "";

  try {
    const data = await postJSON<{ text: string }>("/api/openai/ocr-pages", { pages });
    return sanitizeForPDF(data.text);
  } catch (error) {
    console.error("OCR PDF Error:", error);
    return "";
  }
};
