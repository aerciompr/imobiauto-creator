
export interface PDFSection {
  title: string;
  content: string[]; // Array of paragraphs or bullet points
  isList?: boolean; // If true, renders as bullet points
}

export interface AIRealEstateContent {
  marketingTitle: string;
  headline: string;
  // Highlights specifically for the cover page (max 4 items)
  coverHighlights?: string[]; 
  // Instead of a generic description, we enforce structure
  sections: PDFSection[];
  // Full technical details that should be preserved without overcrowding the cover.
  technicalAppendix?: PDFSection[];
  locationHighlight: string;
}

export interface UnitData {
  unit: string;
  floor: string;
  view: string;
  area: string;
  status: string;
  price: string;
  paymentPlan?: {
    ato: string;
    sinal: string;
    mensais: string;
    semestrais: string;
    financiamento: string;
  };
}

export interface PropertyData {
  title: string;
  price: string;
  location: string;
  features: string;
  description: string;
  isPriceTable?: boolean;
  aiContent?: AIRealEstateContent;
  units?: UnitData[];
}

export interface ProcessedImage {
  originalUrl: string;
  watermarkedUrl: string;
  file: File;
}

export interface ImageDimensions {
  width: number;
  height: number;
  ratio: number; // width / height
}

// NEW: Structured image data for the print layout
export interface PrintableImage {
  url: string;
  isPortrait: boolean;
}

export enum Step {
  UPLOAD = 1,
  DETAILS = 2,
  WATERMARK = 3,
  PREVIEW = 4
}

export interface WatermarkSettings {
  opacity: number;
  scale: number;
  position: 'center' | 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
}
