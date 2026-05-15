
import React, { useState } from 'react';
import { PropertyData, PrintableImage } from '../types';
import { ArrowLeft, CheckCircle2, X, Eye, Printer, Download, Loader2 } from 'lucide-react';
import PrintLayout from './PrintLayout';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface StepPreviewProps {
  processedImages: PrintableImage[]; 
  logo: File | null;
  data: PropertyData;
  onBack: () => void;
}

const StepPreview: React.FC<StepPreviewProps> = ({ processedImages, logo, data, onBack }) => {
  const [logoUrl, setLogoUrl] = React.useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  React.useEffect(() => {
    if (logo) setLogoUrl(URL.createObjectURL(logo));
  }, [logo]);

  const handlePrint = () => {
    window.print();
  };

  const safeTitle = () => data.title ? data.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30) : 'Ficha_Imovel';

  const downloadBlob = async (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const prepareCaptureContainer = async () => {
    const printContainer = document.querySelector('.pdf-capture-container') as HTMLElement;
    if (!printContainer) return null;

    printContainer.classList.remove('hidden');
    printContainer.classList.add('block');
    printContainer.style.position = 'absolute';
    printContainer.style.left = '-10000px';
    printContainer.style.top = '0';
    printContainer.style.width = '210mm';
    printContainer.style.background = '#ffffff';

    await new Promise((resolve) => setTimeout(resolve, 250));
    return printContainer;
  };

  const cleanupCaptureContainer = (printContainer: HTMLElement | null) => {
    if (!printContainer) return;
    printContainer.classList.add('hidden');
    printContainer.classList.remove('block');
    printContainer.removeAttribute('style');
  };

  const handleServerDownload = async (printContainer: HTMLElement) => {
    const inlineStyles = (source: HTMLElement, target: HTMLElement) => {
      const computed = window.getComputedStyle(source);
      const cssText = Array.from(computed)
        .map((property) => `${property}:${computed.getPropertyValue(property)};`)
        .join('');
      target.setAttribute('style', cssText);

      Array.from(source.children).forEach((sourceChild, index) => {
        inlineStyles(sourceChild as HTMLElement, target.children[index] as HTMLElement);
      });
    };

    const html = Array.from(printContainer.querySelectorAll('.pdf-page'))
      .map((page) => {
        const clone = page.cloneNode(true) as HTMLElement;
        inlineStyles(page as HTMLElement, clone);
        return clone.outerHTML;
      })
      .join('');

    const response = await fetch('/api/pdf/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        html,
        fileName: safeTitle()
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Falha ao gerar PDF no servidor.');
    }

    const blob = await response.blob();
    await downloadBlob(blob, `${safeTitle()}.pdf`);
  };

  const handleCanvasFallbackDownload = async (printContainer: HTMLElement) => {
    const pages = Array.from(printContainer.querySelectorAll('.pdf-page')) as HTMLElement[];
    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

    for (let i = 0; i < pages.length; i++) {
      const pageEl = pages[i];
      if (i > 0) pdf.addPage('a4', 'p');

      const canvas = await html2canvas(pageEl, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff'
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.96);
      pdf.addImage(imgData, 'JPEG', 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight());
    }

    pdf.save(`${safeTitle()}.pdf`);
  };

  const handleDownload = async () => {
    setIsGenerating(true);
    let printContainer: HTMLElement | null = null;
    try {
        printContainer = await prepareCaptureContainer();
        if (!printContainer) return;
        try {
          await handleServerDownload(printContainer);
        } catch (serverError) {
          console.warn('Server PDF failed, using canvas fallback.', serverError);
          throw serverError;
        }
    } catch (error) {
        console.error("Error generating PDF", error);
        alert("Ocorreu um erro ao gerar o PDF. Tente imprimir a tela.");
    } finally {
        cleanupCaptureContainer(printContainer);
        setIsGenerating(false);
    }
  };

  return (
    <>
      {/* 
        === VERSÃO DE IMPRESSÃO (INVISÍVEL NA TELA) === 
        Esta div só aparece quando window.print() é chamado.
        Ela está fora de qualquer modal/scroll, garantindo impressão perfeita.
      */}
      <div className="hidden print:block print:absolute print:top-0 print:left-0 print:w-full print:bg-white print:z-[9999] print-only-container">
          <PrintLayout data={data} images={processedImages} logoUrl={logoUrl} />
      </div>

      <div className="hidden pdf-capture-container">
          <PrintLayout data={data} images={processedImages} logoUrl={logoUrl} />
      </div>

      {/* 
        === INTERFACE DO USUÁRIO (VISÍVEL NA TELA) === 
        Tudo aqui tem a classe 'print:hidden' para sumir na impressão.
      */}
      <div className="space-y-6 animate-fade-in pb-20 print:hidden">
        
        {/* MODAL DE VISUALIZAÇÃO */}
        {showPreviewModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/95 overflow-y-auto animate-fade-in flex flex-col items-center">
              
              {/* Toolbar */}
              <div className="sticky top-0 w-full bg-slate-800 text-white p-4 shadow-lg flex justify-between items-center z-50 border-b border-slate-700">
                  <div className="flex items-center gap-4">
                      <button 
                          onClick={() => setShowPreviewModal(false)}
                          className="p-2 hover:bg-slate-700 rounded-full transition text-slate-400 hover:text-white"
                          title="Fechar"
                      >
                          <X size={24}/>
                      </button>
                      <div>
                          <h3 className="font-bold text-lg">Visualização Final</h3>
                          <p className="text-xs text-slate-400">
                              Faça o <strong>Download</strong> em alta resolução ou imprima diretamente.
                          </p>
                      </div>
                  </div>

                  <div className="flex gap-3">
                      <button
                          onClick={handleDownload}
                          disabled={isGenerating}
                          className="px-6 py-2 rounded-lg font-bold shadow-lg transition flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-70"
                      >
                          {isGenerating ? <Loader2 size={20} className="animate-spin"/> : <Download size={20} />}
                          BAIXAR PDF
                      </button>
                      <button
                          onClick={handlePrint}
                          className="px-6 py-2 rounded-lg font-bold shadow-lg transition flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white"
                      >
                          <Printer size={20}/>
                          IMPRIMIR
                      </button>
                  </div>
              </div>

              {/* Área de Visualização (Scrollável) */}
              <div className="w-full flex justify-center py-8 px-4">
                  <div className="bg-slate-200 p-8 shadow-inner flex flex-col items-center gap-8 min-h-screen origin-top transform scale-[0.8] md:scale-100">
                      <PrintLayout data={data} images={processedImages} logoUrl={logoUrl} />
                  </div>
              </div>
          </div>
        )}


        {/* DASHBOARD PRINCIPAL */}
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
              
              {/* Header */}
              <div className="bg-slate-900 p-8 text-center">
                  <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-900 shadow-xl">
                      <CheckCircle2 size={32} strokeWidth={3}/>
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-2">Pronto para Gerar!</h2>
                  <p className="text-slate-400">Suas imagens e textos foram processados com sucesso.</p>
              </div>

              {/* Actions */}
              <div className="p-8 space-y-6">
                  
                  <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg text-sm text-amber-900 mb-4 text-center">
                      <strong>Dica:</strong> O download usa exatamente o layout da visualização final.
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <button
                          onClick={() => setShowPreviewModal(true)}
                          className="w-full bg-slate-900 text-white text-lg font-bold py-4 rounded-xl shadow-lg hover:bg-slate-800 transition flex items-center justify-center gap-3 transform hover:scale-[1.01]"
                      >
                          <Eye size={24} className="text-amber-500"/>
                          VISUALIZAR
                      </button>
                      
                      <button
                          onClick={handleDownload}
                          disabled={isGenerating}
                          className="w-full bg-blue-600 text-white text-lg font-bold py-4 rounded-xl shadow-lg hover:bg-blue-700 transition flex items-center justify-center gap-3 transform hover:scale-[1.01] disabled:opacity-70 disabled:scale-100"
                      >
                          {isGenerating ? <Loader2 size={24} className="animate-spin text-white"/> : <Download size={24} className="text-white"/>}
                          BAIXAR PDF DIRETO
                      </button>
                  </div>

                  <div className="text-center pt-4">
                      <button onClick={onBack} className="text-slate-500 hover:text-slate-800 font-medium flex items-center justify-center gap-2 mx-auto">
                          <ArrowLeft size={16}/> Voltar para ajustes
                      </button>
                  </div>
              </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default StepPreview;
