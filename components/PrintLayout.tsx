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

// A4 Page Component
const A4Page: React.FC<{ children: React.ReactNode; className?: string; landscape?: boolean }> = ({ children, className = "", landscape = false }) => (
  <div 
      className={`
          pdf-page
          relative bg-white overflow-hidden mx-auto my-8 shadow-2xl 
          ${landscape 
              ? 'w-[297mm] h-[210mm] min-w-[297mm] min-h-[210mm] print:w-[297mm] print:h-[210mm] is-landscape' 
              : 'w-[210mm] h-[297mm] min-w-[210mm] min-h-[297mm] print:w-[210mm] print:h-[297mm] is-portrait'
          }
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
  
  const highlights = ai.coverHighlights && ai.coverHighlights.length > 0 
    ? ai.coverHighlights.slice(0, 4) 
    : ["Localização Privilegiada", "Acabamento de Alto Padrão", "Documentação Regularizada", "Excelente Oportunidade"];

  // --- SMART PAGINATION LOGIC FOR TEXT ---
  // We need to split sections and their content across pages
  const textPages: { title: string; content: string[]; isList: boolean }[][] = [];
  let currentPageSections: { title: string; content: string[]; isList: boolean }[] = [];
  let currentSpaceUsed = 0;
  
  // Use a more aggressive estimate for available space to maximize first page
  // With 2 columns, we have roughly double the units. 1 unit = roughly 1 line
  const PAGE_1_MAX_UNITS = 55; // Keep commercial content on one page when compact
  const PAGE_N_MAX_UNITS = 65; // Reduced from 85

  const isSubstantialSection = (section: { content: string[] }) => {
      const content = section.content || [];
      return content.length > 6 || content.join(' ').length > 700;
  };

  const compactUnits = (data.units || []).slice(0, 4);
  const previewSections = [
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

  previewSections.forEach((section) => {
      let sectionTitleAdded = false;
      let currentSectionContent: string[] = [];
      
      const addSectionToPage = () => {
          if (currentSectionContent.length > 0) {
              currentPageSections.push({
                  title: section.title, // Removed (Continuação) or (Cont.) logic to keep it looking clean
                  content: currentSectionContent,
                  isList: section.isList || false
              });
              sectionTitleAdded = true;
              currentSectionContent = [];
          }
      };

      const titleUnits = 2; // Title takes about 2 lines of space per column
      
      const maxAllowed = textPages.length === 0 ? PAGE_1_MAX_UNITS : PAGE_N_MAX_UNITS;
      
      if (currentSpaceUsed + titleUnits > maxAllowed && currentPageSections.length > 0) {
          textPages.push(currentPageSections);
          currentPageSections = [];
          currentSpaceUsed = 0;
      }
      
      currentSpaceUsed += titleUnits;

      section.content.forEach((item) => {
          // Estimate lines this item will take.
          // In a 2-column layout each line is about 45-50 characters wide.
          const lines = Math.ceil(item.length / 50); 
          const itemUnits = section.isList ? lines : lines + 0.5; // Less spacing for paragraphs
          
          const currentMaxAllowed = textPages.length === 0 ? PAGE_1_MAX_UNITS : PAGE_N_MAX_UNITS;

          if (currentSpaceUsed + itemUnits > currentMaxAllowed && (currentPageSections.length > 0 || currentSectionContent.length > 0)) {
              addSectionToPage();
              if (currentPageSections.length > 0) {
                  textPages.push(currentPageSections);
                  currentPageSections = [];
              }
              currentSpaceUsed = titleUnits; // Account for title on new page
          }
          
          currentSectionContent.push(item);
          currentSpaceUsed += itemUnits;
      });
      
      addSectionToPage();
      currentSpaceUsed += 1; // Less margin after section
  });

  if (currentPageSections.length > 0) {
      textPages.push(currentPageSections);
  }

  // --- SMART PAGINATION LOGIC FOR IMAGES ---
  // ALWAYS 1 image per page to maintain original presentation format
  const galleryPages: PrintableImage[][] = [];
  for (let idx = 0; idx < images.length; idx++) {
      galleryPages.push([images[idx]]);
  }

  return (
    <div className="w-full flex flex-col items-center py-8 print:bg-white print:block print:p-0">
      
      {/* ================= TEXT PAGES ================= */}
      {textPages.map((pageSections, pIdx) => (
        <A4Page key={`text-${pIdx}`} className="px-[15mm] pt-[10mm] pb-[40mm]">
          {/* Barra superior amarela */}
          <div 
              className="absolute top-0 left-0 w-full h-4 bg-[#fbbf24] !bg-[#fbbf24]" 
              style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
          ></div>

          {pIdx === 0 && (
            <div className="mt-4 mb-6 border-b-2 border-[#fbbf24] pb-6">
                 <div className="flex justify-between items-start mb-6 gap-6">
                     <div className="flex-1 pr-4">
                        <h1 className="font-serif text-[20pt] font-black text-[#0f172a] uppercase leading-[1.15] mb-3 break-words">{ai.marketingTitle}</h1>
                        <h2 className="text-[#d97706] text-sm font-bold leading-snug uppercase tracking-wide break-words">{ai.headline}</h2>
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
                 
                 {/* REFACTORED HIGHLIGHTS SECTION */}
                 <div className="grid grid-cols-2 gap-x-6 gap-y-4 bg-slate-50 p-5 rounded-xl border-l-8 border-[#fbbf24]">
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
                                <span className="font-serif font-black text-2xl text-[#d97706] tracking-tighter leading-none">
                                    {first}
                                </span>
                                <span className="text-xs text-slate-800 font-bold uppercase tracking-wide leading-tight">
                                    {rest}
                                </span>
                            </div>
                        );
                    })}
                 </div>
            </div>
          )}

          <div className={`flex flex-row gap-8 items-start w-full ${pIdx > 0 ? 'mt-4' : ''}`}>
              {/* Calculate columns locally for a stable browser preview */}
              {(() => {
                  const col1: typeof pageSections = [];
                  const col2: typeof pageSections = [];
                  let col1Units = 0;
                  let col2Units = 0;

                  pageSections.forEach(section => {
                      const titleUnits = 2;
                      const itemsUnits = section.content.reduce((acc, item) => {
                          const lines = Math.ceil(item.length / 50);
                          return acc + (section.isList ? lines : lines + 0.5);
                      }, 0);
                      const totalUnits = titleUnits + itemsUnits + 1;

                      if (col1Units <= col2Units) {
                          col1.push(section);
                          col1Units += totalUnits;
                      } else {
                          col2.push(section);
                          col2Units += totalUnits;
                      }
                  });

                  const renderSection = (section: typeof pageSections[0], idx: number) => (
                      <div key={idx} className="mb-6">
                          <h3 className="font-serif text-lg font-bold text-[#0f172a] mb-2 flex items-center gap-2 uppercase border-b border-slate-200 pb-1">
                              <span 
                                  className="w-3 h-3 bg-[#fbbf24] !bg-[#fbbf24] inline-block"
                                  style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
                              ></span>
                              {section.title}
                          </h3>
                          {section.isList ? (
                              <ul className="space-y-1 mt-2">
                                  {section.content.map((item, i) => (
                                      <li key={i} className="flex items-start gap-2 text-[12px] text-slate-800 text-justify leading-relaxed font-medium">
                                          <span className="text-[#d97706] font-bold">✓</span><span className="flex-1">{item}</span>
                                      </li>
                                  ))}
                              </ul>
                          ) : (
                              <div className="space-y-3 mt-2">
                                   {section.content.map((item, i) => (
                                      <p key={i} className="text-[12px] text-slate-700 text-justify leading-relaxed indent-4">{item}</p>
                                   ))}
                              </div>
                          )}
                      </div>
                  );

                  return (
                      <>
                          <div className="w-1/2 flex flex-col">
                              {col1.map((section, idx) => renderSection(section, idx))}
                          </div>
                          <div className="w-1/2 flex flex-col">
                              {col2.map((section, idx) => renderSection(section, idx))}
                          </div>
                      </>
                  );
              })()}
          </div>
          <Footer pageNum={pIdx + 1} logoUrl={logoUrl} />
        </A4Page>
      ))}

      {/* ================= GALLERY PAGES ================= */}
      {galleryPages.map((pageImages, pIdx) => {
         const img = pageImages[0];
         return (
         <A4Page key={pIdx} landscape={!img.isPortrait} className="p-[15mm] pt-[15mm]">
             <div className="flex flex-col h-[calc(100%-35mm)] items-center justify-center -mt-4">
                <div className={`relative w-full h-[95%] bg-white rounded-lg overflow-hidden flex items-center justify-center`}>
                    <img 
                        src={img.url} 
                        className="w-full h-full object-contain" 
                        alt={`Galeria ${pIdx}`} 
                        loading="eager"
                    />
                </div>
             </div>

             <Footer pageNum={textPages.length + pIdx + 1} logoUrl={logoUrl} />
         </A4Page>
         );
      })}

    </div>
  );
};

export default PrintLayout;
