import { jsPDF } from 'jspdf';
import { AIRealEstateContent, PDFSection, PrintableImage, PropertyData } from '../types';

const PAGE = {
  width: 210,
  height: 297,
  marginX: 16,
  top: 14,
  bottom: 40,
  footerH: 32
};

const colors = {
  ink: '#0f172a',
  muted: '#475569',
  line: '#cbd5e1',
  amber: '#fbbf24',
  amberDark: '#b45309',
  pale: '#f8fafc'
};

const stripUnsupported = (text?: string | null) => (text || '')
  .replace(/[\u{1F000}-\u{1FAFF}]/gu, '')
  .replace(/[“”]/g, '"')
  .replace(/[‘’]/g, "'")
  .replace(/[–—]/g, '-')
  .replace(/\s+/g, ' ')
  .trim();

const fileNameSafe = (text: string) => stripUnsupported(text)
  .replace(/[^a-zA-Z0-9_-]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 36) || 'Ficha_Imovel';

const dataUrlFromUrl = async (url: string | null): Promise<string | null> => {
  if (!url) return null;
  if (url.startsWith('data:')) return url;

  try {
    const blob = await fetch(url).then((response) => response.blob());
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

const imageFormat = (dataUrl: string) => dataUrl.includes('image/png') ? 'PNG' : 'JPEG';

const imageSize = (src: string): Promise<{ width: number; height: number }> => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
  img.onerror = reject;
  img.src = src;
});

class PdfWriter {
  private doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  private y = PAGE.top;
  private pageNum = 1;
  private logoData: string | null = null;

  constructor(private data: PropertyData, logoData: string | null) {
    this.logoData = logoData;
  }

  get instance() {
    return this.doc;
  }

  startTextPage(title?: string) {
    if (this.pageNum > 1 || this.y > PAGE.top + 1) {
      this.doc.addPage('a4', 'p');
      this.pageNum += 1;
    }
    this.y = PAGE.top;
    this.headerBar();
    if (title) this.sectionHeading(title, 16);
  }

  ensure(needed: number, title?: string) {
    if (this.y + needed <= PAGE.height - PAGE.bottom) return;
    this.footer();
    this.doc.addPage('a4', 'p');
    this.pageNum += 1;
    this.y = PAGE.top;
    this.headerBar();
    if (title) this.sectionHeading(title, 14);
  }

  finishTextPage() {
    this.footer();
  }

  headerBar() {
    this.doc.setFillColor(colors.amber);
    this.doc.rect(0, 0, PAGE.width, 4, 'F');
    this.y = 12;
  }

  cover(ai: AIRealEstateContent) {
    this.headerBar();
    const price = stripUnsupported(this.data.price || 'Sob consulta');
    const location = stripUnsupported(this.data.location || ai.locationHighlight || '');
    const title = stripUnsupported(ai.marketingTitle || this.data.title || 'Ficha do Imovel');
    const headline = stripUnsupported(ai.headline || 'Oportunidade imobiliaria');

    this.doc.setTextColor(colors.ink);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(21);
    this.writeWrapped(title.toUpperCase(), PAGE.marginX, this.y + 8, 118, 8);

    this.doc.setTextColor(colors.amberDark);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(11);
    this.writeWrapped(headline.toUpperCase(), PAGE.marginX, this.y + 2, 118, 5);

    this.doc.setTextColor(colors.ink);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(16);
    this.doc.text(price, PAGE.width - PAGE.marginX, 28, { align: 'right', maxWidth: 62 });

    if (location) {
      this.doc.setFillColor(colors.amber);
      this.doc.roundedRect(132, 38, 62, 12, 2, 2, 'F');
      this.doc.setTextColor(colors.ink);
      this.doc.setFontSize(8);
      this.doc.text(location.toUpperCase(), 163, 46, { align: 'center', maxWidth: 56 });
    }

    this.y = 64;
    this.highlights(ai.coverHighlights || []);

    (ai.sections || []).slice(0, 4).forEach((section) => this.section(section));
    this.footer();
  }

  highlights(items: string[]) {
    const highlights = (items.length ? items : [
      'Localizacao privilegiada',
      'Alto padrao',
      'Excelente investimento',
      'Condicoes comerciais'
    ]).slice(0, 4);

    this.doc.setFillColor(colors.pale);
    this.doc.roundedRect(PAGE.marginX, this.y, PAGE.width - PAGE.marginX * 2, 28, 2, 2, 'F');
    this.doc.setDrawColor(colors.amber);
    this.doc.setLineWidth(2);
    this.doc.line(PAGE.marginX, this.y, PAGE.marginX, this.y + 28);

    highlights.forEach((item, index) => {
      const x = PAGE.marginX + 8 + (index % 2) * 84;
      const y = this.y + 9 + Math.floor(index / 2) * 12;
      this.doc.setTextColor(colors.amberDark);
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(12);
      this.doc.text(stripUnsupported(item).toUpperCase(), x, y, { maxWidth: 72 });
    });

    this.y += 38;
  }

  section(section: PDFSection) {
    const title = stripUnsupported(section.title);
    const content = (section.content || []).map(stripUnsupported).filter(Boolean);
    if (!title || content.length === 0) return;

    const titleHeight = 8;
    this.ensure(titleHeight + 10, title);
    this.sectionHeading(title, 13);

    content.forEach((item) => {
      const maxWidth = PAGE.width - PAGE.marginX * 2 - (section.isList ? 6 : 0);
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(section.isList ? 9.2 : 9.6);
      const lines = this.doc.splitTextToSize(item, maxWidth);
      const height = lines.length * 4.6 + (section.isList ? 1.5 : 3);
      this.ensure(height + 2, title);
      this.doc.setTextColor(colors.muted);

      if (section.isList) {
        this.doc.setTextColor(colors.amberDark);
        this.doc.text('-', PAGE.marginX, this.y);
        this.doc.setTextColor(colors.muted);
        this.doc.text(lines, PAGE.marginX + 5, this.y, { maxWidth });
      } else {
        this.doc.text(lines, PAGE.marginX, this.y, { maxWidth, align: 'justify' });
      }

      this.y += height;
    });

    this.y += 2;
  }

  sectionHeading(title: string, size: number) {
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(size);
    this.doc.setTextColor(colors.ink);
    this.doc.text(stripUnsupported(title).toUpperCase(), PAGE.marginX, this.y);
    this.doc.setDrawColor(colors.line);
    this.doc.line(PAGE.marginX, this.y + 2.5, PAGE.width - PAGE.marginX, this.y + 2.5);
    this.y += size > 14 ? 10 : 8;
  }

  writeWrapped(text: string, x: number, y: number, width: number, lineH: number) {
    const lines = this.doc.splitTextToSize(text, width);
    this.doc.text(lines, x, y);
    this.y = Math.max(this.y, y + lines.length * lineH);
  }

  footer() {
    this.doc.setFillColor(colors.amber);
    this.doc.rect(0, PAGE.height - PAGE.footerH, PAGE.width, PAGE.footerH, 'F');
    this.doc.setDrawColor(colors.ink);
    this.doc.setLineWidth(1);
    this.doc.line(0, PAGE.height - PAGE.footerH, PAGE.width, PAGE.height - PAGE.footerH);

    if (this.logoData) {
      try {
        this.doc.addImage(this.logoData, imageFormat(this.logoData), PAGE.marginX, PAGE.height - 29, 22, 22);
      } catch {
        // Logo is optional for generation.
      }
    }

    this.doc.setTextColor(colors.ink);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(7);
    this.doc.text('ENTRE EM CONTATO E AGENDE SUA VISITA', PAGE.width / 2, PAGE.height - 25, { align: 'center' });
    this.doc.setFontSize(13);
    this.doc.text('MARCELO DOS ANJOS', PAGE.width / 2, PAGE.height - 18, { align: 'center' });
    this.doc.setFontSize(7);
    this.doc.text('CORRETOR DE IMOVEIS | CRECI 1089', PAGE.width / 2, PAGE.height - 13, { align: 'center' });
    this.doc.setFontSize(8);
    this.doc.text('marcelodosanjosimoveis@hotmail.com  |  www.anjosimoveis.net', PAGE.width / 2, PAGE.height - 7, { align: 'center' });

    this.doc.setFontSize(8);
    this.doc.text('MAIS INFORMACOES E VENDAS:', PAGE.width - PAGE.marginX, PAGE.height - 22, { align: 'right' });
    this.doc.setFontSize(12);
    this.doc.text('(82) 9 9901-8701', PAGE.width - PAGE.marginX, PAGE.height - 15, { align: 'right' });
    this.doc.text('(82) 9 8879-3479', PAGE.width - PAGE.marginX, PAGE.height - 8, { align: 'right' });

    this.doc.setFontSize(6);
    this.doc.text(`Pagina ${this.pageNum}`, PAGE.width / 2, PAGE.height - 2.5, { align: 'center' });
  }
}

const addImagePage = async (doc: jsPDF, image: PrintableImage, pageNum: number, logoData: string | null) => {
  const landscape = !image.isPortrait;
  doc.addPage('a4', landscape ? 'l' : 'p');
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const footerH = 28;
  const margin = 12;
  const boxW = pageW - margin * 2;
  const boxH = pageH - footerH - margin * 2;
  const size = await imageSize(image.url);
  const ratio = Math.min(boxW / size.width, boxH / size.height);
  const imgW = size.width * ratio;
  const imgH = size.height * ratio;
  const x = (pageW - imgW) / 2;
  const y = margin + (boxH - imgH) / 2;

  doc.addImage(image.url, 'JPEG', x, y, imgW, imgH);
  doc.setFillColor(colors.amber);
  doc.rect(0, pageH - footerH, pageW, footerH, 'F');
  if (logoData) {
    try {
      doc.addImage(logoData, imageFormat(logoData), margin, pageH - 24, 18, 18);
    } catch {
      // optional
    }
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(colors.ink);
  doc.text('MARCELO DOS ANJOS | CRECI 1089', pageW / 2, pageH - 17, { align: 'center' });
  doc.setFontSize(8);
  doc.text('(82) 9 9901-8701  |  (82) 9 8879-3479', pageW / 2, pageH - 10, { align: 'center' });
  doc.setFontSize(6);
  doc.text(`Pagina ${pageNum}`, pageW / 2, pageH - 3, { align: 'center' });
};

export const generatePropertyPdf = async (
  data: PropertyData,
  images: PrintableImage[],
  logoUrl: string | null
) => {
  const ai = data.aiContent || {
    marketingTitle: data.title || 'Ficha do Imovel',
    headline: 'Oportunidade imobiliaria',
    coverHighlights: [],
    sections: [],
    technicalAppendix: [],
    locationHighlight: data.location || ''
  };

  const logoData = await dataUrlFromUrl(logoUrl);
  const writer = new PdfWriter(data, logoData);
  writer.cover(ai);

  const technical = ai.technicalAppendix || [];
  if (technical.length > 0) {
    writer.startTextPage('Ficha tecnica completa');
    technical.forEach((section) => writer.section(section));
    writer.finishTextPage();
  }

  const units = data.units || [];
  if (units.length > 0) {
    writer.startTextPage('Unidades e condicoes');
    writer.section({
      title: 'Unidades disponíveis',
      isList: true,
      content: units.map((unit) => [
        unit.unit,
        unit.floor && `andar: ${unit.floor}`,
        unit.view && `vista: ${unit.view}`,
        unit.area && `area: ${unit.area}`,
        unit.status && `status: ${unit.status}`,
        unit.price && `valor: ${unit.price}`
      ].filter(Boolean).join(' | '))
    });
    writer.finishTextPage();
  }

  let pageNum = writer.instance.getNumberOfPages();
  for (const image of images) {
    pageNum += 1;
    await addImagePage(writer.instance, image, pageNum, logoData);
  }

  writer.instance.save(`${fileNameSafe(data.title || ai.marketingTitle)}.pdf`);
};
