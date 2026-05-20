import React from 'react';
import { PropertyData, PrintableImage } from '../types';

interface PrintLayoutProps {
  data: PropertyData;
  images: PrintableImage[];
  logoUrl: string | null;
}

const classifyPrice = (price: string) => {
  const clean = (price || '').trim();
  if (!clean) return { label: '', value: 'Sob Consulta' };
  const isStarting = /(^|\b)(a\s*partir\s*de|apartir\s*de|desde)\b/i.test(clean);
  const value = clean
    .replace(/^(a\s*partir\s*de|apartir\s*de|desde)\s*:?\s*/i, '')
    .trim();
  return {
    label: isStarting ? 'A partir de:' : '',
    value: value || clean
  };
};

// A4 portrait page component
const A4Page: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = "" }) => (
  <div 
      className={`
          pdf-page
          relative bg-white overflow-hidden mx-auto my-8 shadow-2xl 
          w-[210mm] h-[297mm] min-w-[210mm] min-h-[297mm] print:w-[210mm] print:h-[297mm] is-portrait
          print:shadow-none print:m-0 print:my-0 print:break-after-page
          ${className}
      `}
      style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
  >
      {children}
  </div>
);

// Footer Component
const Footer = ({ pageNum, logoUrl }: { pageNum?: number; logoUrl: string | null }) => (
  <div 
    className="absolute bottom-0 left-0 right-0 h-[35mm] bg-[#fbbf24] !bg-[#fbbf24] text-slate-900 flex items-center justify-between px-[10mm] border-t-4 border-slate-900 print:h-[35mm]"
    style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
  >
      <div className="flex items-center h-full w-1/4">
          {logoUrl && <img src={logoUrl} className="h-24 w-auto object-contain" alt="Logo" loading="eager" />}
      </div>
      <div className="flex flex-col justify-center items-center text-center h-full flex-1 px-2">
          <p className="font-bold text-[10px] uppercase tracking-widest mb-1">Entre em contato e agende sua visita</p>
          <h3 className="font-serif font-black text-xl uppercase leading-none mb-0.5">MARCELO DOS ANJOS</h3>
          <p className="text-[11px] font-bold uppercase leading-tight">CORRETOR DE IMÓVEIS</p>
          <p className="text-[11px] font-bold uppercase mb-2">CRECI 1089</p>
          <div className="w-full h-px bg-slate-900/20 mb-2"></div>
          <div className="flex gap-4 text-[11px] font-bold">
               <span>marcelodosanjosimoveis@hotmail.com</span>
               <span>•</span>
               <span>www.anjosimoveis.net</span>
          </div>
      </div>
      <div className="text-right flex flex-col justify-end pb-[6mm] h-full w-[35%]">
          <p className="text-[9px] font-bold uppercase mb-1.5 opacity-80">MAIS INFORMAÇÕES E VENDAS:</p>
          <div className="flex items-center justify-end gap-1.5 mb-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-message-circle"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>
              <span className="font-black text-[12pt] leading-none tracking-tight whitespace-nowrap">(82) 9 9901-8701</span>
          </div>
          <div className="flex items-center justify-end gap-1.5">
              <span className="font-black text-[12pt] leading-none tracking-tight whitespace-nowrap">(82) 9 8879-3479</span>
          </div>
      </div>
      {pageNum && (
          <div className="absolute bottom-1 right-[50%] translate-x-[50%] text-[8px] font-bold text-slate-700 opacity-60">
              Página {pageNum}
          </div>
      )}
  </div>
);

const PrintLayout: React.FC<PrintLayoutProps> = ({ data, images = [], logoUrl }) => {
  const ai = data.aiContent || {
    marketingTitle: data.title || "Imóvel Sem Título",
    headline: "Oportunidade Exclusiva",
    coverHighlights: [],
    sections: [],
    technicalAppendix: [],
    locationHighlight: data.location || ""
  };

  const formattedPrice = classifyPrice(data.price || "Sob Consulta");
  const isPriceTable = Boolean(data.isPriceTable);
  
  const highlights = ai.coverHighlights && ai.coverHighlights.length > 0 
    ? ai.coverHighlights.slice(0, 4) 
    : ["Localização Privilegiada", "Acabamento de Alto Padrão", "Documentação Regularizada", "Excelente Oportunidade"];

  const isSubstantialSection = (section: { content: string[] }) => {
      const content = section.content || [];
      return content.length > 6 || content.join(' ').length > 700;
  };

  const compactUnits = (data.units || []).slice(0, 4);
  const previewSections = isPriceTable ? [] : [
      ...(ai.sections || []),
      ...((ai.technicalAppendix || []).filter((section) => !isSubstantialSection(section)).map((section) => ({
          ...section,
          content: section.content.slice(0, 4)
      }))),
      ...(compactUnits.length > 0 ? [{
          title: 'Unidades e condições',
          isList: true,
          content: compactUnits.map((unit) => [
              unit.unit,
              unit.area && `área: ${unit.area}`,
              unit.status && `status: ${unit.status}`,
              unit.price && `valor: ${unit.price}`
          ].filter(Boolean).join(' | '))
      }] : []),
      ...((ai.technicalAppendix || []).filter(isSubstantialSection).map((section) => ({
          ...section,
          title: section.title.startsWith('Anexo') ? section.title : `Anexo Técnico - ${section.title}`
      })))
  ].slice(0, 6).map((section) => ({
      ...section,
      content: section.content.slice(0, section.isList ? 8 : 3)
  }));

  const totalTextUnits = previewSections.reduce((sum, section) => {
      const contentUnits = section.content.reduce((acc, item) => acc + Math.ceil(item.length / 58), 0);
      return sum + 2 + contentUnits;
  }, 0);
  const density = totalTextUnits > 62 ? 'dense' : totalTextUnits > 48 ? 'medium' : 'normal';
  const titleClass = density === 'dense' ? 'text-[17pt]' : density === 'medium' ? 'text-[19pt]' : 'text-[20pt]';
  const sectionTitleClass = density === 'dense' ? 'text-[12px]' : 'text-[14px]';
  const bodyClass = density === 'dense' ? 'text-[9px] leading-[1.35]' : density === 'medium' ? 'text-[10px] leading-[1.45]' : 'text-[11px] leading-relaxed';
  const sectionGap = density === 'dense' ? 'mb-2' : 'mb-4';
  const gridGap = density === 'dense' ? 'gap-x-4 gap-y-1' : 'gap-x-8 gap-y-3';

  // --- SMART PAGINATION LOGIC FOR IMAGES ---
  // ALWAYS 1 image per page to maintain original presentation format
  const galleryPages: PrintableImage[][] = [];
  for (let idx = 0; idx < images.length; idx++) {
      galleryPages.push([images[idx]]);
  }

  return (
    <div className="w-full flex flex-col items-center py-8 print:bg-white print:block print:p-0">
      
      {/* ================= SINGLE A4 TEXT PAGE ================= */}
        <A4Page key="text-cover" className="px-[15mm] pt-[10mm] pb-[35mm]">
          {/* Barra superior amarela */}
          <div 
              className="absolute top-0 left-0 w-full h-4 bg-[#fbbf24] !bg-[#fbbf24]" 
              style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
          ></div>

            <div className={`${isPriceTable ? 'mt-16 mb-4 pb-8' : density === 'dense' ? 'mt-3 mb-3 pb-4' : 'mt-4 mb-5 pb-5'} border-b-2 border-[#fbbf24]`}>
                 <div className="flex justify-between items-start mb-6 gap-6">
                     <div className="flex-1 pr-4">
                        <h1 className={`font-serif ${titleClass} font-black text-[#0f172a] uppercase leading-[1.12] mb-2 break-words`}>{ai.marketingTitle}</h1>
                        <h2 className={`${density === 'dense' ? 'text-[10px]' : 'text-sm'} text-[#d97706] font-bold leading-snug uppercase tracking-wide break-words`}>{isPriceTable ? (data.location || ai.headline) : ai.headline}</h2>
                     </div>
                     <div className="flex-none w-2/5 text-right pt-1">
                        {(() => {
                            if (formattedPrice.label) {
                                return (
                                    <div className="mb-4">
                                        <div className="text-[12px] font-bold text-slate-500 uppercase tracking-widest leading-normal mb-1">{formattedPrice.label}</div>
                                        <div className="font-serif font-black text-2xl text-[#0f172a] leading-normal break-words">{formattedPrice.value}</div>
                                    </div>
                                );
                            }
                            return (
                                <div className="mb-4 font-serif font-black text-2xl text-[#0f172a] leading-normal break-words">
                                    {formattedPrice.value}
                                </div>
                            );
                        })()}
                        <div 
                            className="text-slate-900 text-[11px] font-bold uppercase tracking-widest bg-[#fbbf24] !bg-[#fbbf24] inline-block px-3 py-2 rounded text-right break-words max-w-full leading-normal"
                            style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
                        >
                            📍 {data.location}
                        </div>
                     </div>
                 </div>
                 
                 {!isPriceTable && <div className={`grid grid-cols-2 ${density === 'dense' ? 'gap-x-4 gap-y-2 p-3' : 'gap-x-6 gap-y-4 p-5'} bg-slate-50 rounded-xl border-l-8 border-[#fbbf24]`}>
                    {highlights.map((highlight, idx) => {
                        const firstSpaceIndex = highlight.indexOf(' ');
                        let first = highlight;
                        let rest = "";
                        
                        if (firstSpaceIndex !== -1) {
                            first = highlight.substring(0, firstSpaceIndex);
                            rest = highlight.substring(firstSpaceIndex + 1);
                        }

                        return (
                            <div key={idx} className="flex flex-row items-baseline gap-2">
                                <span className={`font-serif font-black ${density === 'dense' ? 'text-lg' : 'text-2xl'} text-[#d97706] tracking-tighter leading-none`}>
                                    {first}
                                </span>
                                <span className={`${density === 'dense' ? 'text-[9px]' : 'text-xs'} text-slate-800 font-bold uppercase tracking-wide leading-tight`}>
                                    {rest}
                                </span>
                            </div>
                        );
                    })}
                 </div>}
            </div>

          {isPriceTable && (
              <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-6 text-center">
                  <p className="text-sm font-bold uppercase tracking-widest text-slate-500">Tabela de valores</p>
                  <p className="mt-3 text-lg font-bold text-slate-900">Páginas originais em anexo</p>
              </div>
          )}

          {!isPriceTable && <div className={`grid grid-cols-2 ${gridGap} items-start w-full max-h-[150mm] overflow-hidden`}>
              {previewSections.map((section, idx) => (
                  <div key={idx} className={sectionGap}>
                      <h3 className={`font-serif ${sectionTitleClass} font-bold text-[#0f172a] mb-1.5 flex items-center gap-2 uppercase border-b border-slate-200 pb-1`}>
                          <span 
                              className="w-2.5 h-2.5 bg-[#fbbf24] !bg-[#fbbf24] inline-block shrink-0"
                              style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
                          ></span>
                          {section.title}
                      </h3>
                      {section.isList ? (
                          <ul className={`${density === 'dense' ? 'space-y-0.5' : 'space-y-1'} mt-1`}>
                              {section.content.map((item, i) => (
                                  <li key={i} className={`flex items-start gap-2 ${bodyClass} text-slate-800 text-justify font-medium`}>
                                      <span className="text-[#d97706] font-bold shrink-0">✓</span><span className="flex-1">{item}</span>
                                  </li>
                              ))}
                          </ul>
                      ) : (
                          <div className={`${density === 'dense' ? 'space-y-1' : 'space-y-2'} mt-1`}>
                               {section.content.map((item, i) => (
                                  <p key={i} className={`${bodyClass} text-slate-700 text-justify indent-3`}>{item}</p>
                               ))}
                          </div>
                      )}
                  </div>
              ))}
          </div>}
          <Footer pageNum={1} logoUrl={logoUrl} />
        </A4Page>

      {/* ================= GALLERY PAGES ================= */}
      {galleryPages.map((pageImages, pIdx) => {
         const img = pageImages[0];
         return (
         <A4Page key={pIdx} className="p-[12mm] pt-[12mm]">
             <div className="flex flex-col h-[calc(100%-35mm)] items-center justify-center -mt-4">
                <div className="relative w-full h-full bg-white rounded-lg overflow-hidden flex items-center justify-center">
                    <img 
                        src={img.url} 
                        className="w-full h-full object-contain" 
                        alt={`Galeria ${pIdx}`} 
                        loading="eager"
                    />
                </div>
             </div>

             <Footer pageNum={pIdx + 2} logoUrl={logoUrl} />
         </A4Page>
         );
      })}

    </div>
  );
};

export default PrintLayout;
