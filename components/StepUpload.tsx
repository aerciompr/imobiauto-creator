import React, { useRef, useState } from 'react';
import { Upload, Image as ImageIcon, Trash2, XCircle, Sparkles, Loader2, Video as VideoIcon, Film, Archive, FileType, ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { enhanceImageWithAI } from '../services/geminiService';
import { readFileAsDataURL, extractUniqueFramesFromVideo, extractFilesFromZip } from '../utils/imageProcessing';
import { extractDataFromPDF } from '../utils/pdfExtractor';

interface StepUploadProps {
  photos: File[];
  setPhotos: React.Dispatch<React.SetStateAction<File[]>>;
  logo: File | null;
  setLogo: (file: File | null) => void;
  onNext: () => void;
  onPdfTextExtracted: (text: string) => void;
}

const StepUpload: React.FC<StepUploadProps> = ({ photos, setPhotos, logo, setLogo, onNext, onPdfTextExtracted }) => {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [enhancingIndex, setEnhancingIndex] = useState<number | null>(null);
  const [isProcessingVideo, setIsProcessingVideo] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [hasExtractedData, setHasExtractedData] = useState(false);

  const processFiles = async (files: File[]) => {
    if (files.length > 0) {
      setIsProcessingVideo(true);
      setProcessingStatus('Analisando arquivos...');
      
      let filesToProcess: File[] = files;
      const newPhotos: File[] = [];
      const videosToProcess: File[] = [];
      const pdfsToProcess: File[] = [];
      const textFilesToProcess: File[] = [];
      const pdfImagesToProcess: File[] = [];

      try {
          // 1. Expand ZIPs (Recursive)
          const expandZips = async (files: File[], depth = 0): Promise<File[]> => {
              if (depth > 5) return files; // Safety limit
              const result: File[] = [];
              for (const file of files) {
                  const isZip = file.name.toLowerCase().endsWith('.zip') || 
                                file.type.includes('zip') || 
                                file.type.includes('compressed');
                  
                  if (isZip) {
                      setProcessingStatus(`Extraindo ZIP: ${file.name}...`);
                      try {
                          const extracted = await extractFilesFromZip(file);
                          // Recurse to find zips inside zips
                          const nested = await expandZips(extracted, depth + 1);
                          result.push(...nested);
                      } catch (err) {
                          console.error("ZIP Error", err);
                          // If it fails, we keep the file as is (maybe it's not a real zip)
                          result.push(file);
                      }
                  } else {
                      result.push(file);
                  }
              }
              return result;
          };

          filesToProcess = await expandZips(files);

          // 2. Sort into Types
          for (const file of filesToProcess) {
              if (file.type.startsWith('image/')) {
                  newPhotos.push(file);
              } else if (file.type.startsWith('video/')) {
                  videosToProcess.push(file);
              } else if (file.type === 'application/pdf') {
                  pdfsToProcess.push(file);
              } else if (file.type === 'text/plain' || file.type === 'application/rtf' || file.name.toLowerCase().endsWith('.txt') || file.name.toLowerCase().endsWith('.rtf')) {
                  textFilesToProcess.push(file);
              }
          }

          // 3. Add Images immediately (REMOVED - Now filtered first)
          
          // 4. Process Videos
          let extractedFrames: File[] = [];
          if (videosToProcess.length > 0) {
              setProcessingStatus('Extraindo frames dos vídeos...');
              let currentPool: File[] = [...photos, ...newPhotos];

              for (const video of videosToProcess) {
                  try {
                    const frames = await extractUniqueFramesFromVideo(video, currentPool);
                    extractedFrames = [...extractedFrames, ...frames];
                    currentPool = [...currentPool, ...frames]; 
                  } catch (e) {
                      console.error("Video processing error", e);
                  }
              }

              // (REMOVED - Now filtered first)
          }

          // 5. Process PDFs
          if (pdfsToProcess.length > 0) {
             setProcessingStatus('Lendo PDF (Extraindo Texto e Fotos)...');
             for (const pdf of pdfsToProcess) {
                try {
                    const { text, images } = await extractDataFromPDF(pdf);
                    
                    // Collect images for later filtering
                    if (images.length > 0) {
                        pdfImagesToProcess.push(...images);
                    }

                    // Send text to App state
                    if (text && text.trim().length > 0) {
                        onPdfTextExtracted(text);
                        setHasExtractedData(true);
                    }
                } catch (err) {
                    console.error("Erro ao ler PDF", err);
                }
             }
          }

          // 6. Process Text Files
          if (textFilesToProcess.length > 0) {
              setProcessingStatus('Lendo arquivos de texto...');
              let combinedText = '';
              for (const txt of textFilesToProcess) {
                  try {
                      const content = await txt.text();
                      if (content.trim()) {
                          combinedText += `\n--- Arquivo: ${txt.name} ---\n${content}\n`;
                      }
                  } catch (e) {
                      console.error("Error reading text file", e);
                  }
              }
              if (combinedText) {
                  onPdfTextExtracted(combinedText);
                  setHasExtractedData(true);
              }
          }

          // 7. SMART FILTER: Bypass AI Filtering to save tokens
          const allExtractedPhotos = [...newPhotos, ...extractedFrames, ...pdfImagesToProcess];
          if (allExtractedPhotos.length > 0) {
              setProcessingStatus('Organizando fotos...');
              
              // bypass filtering and ranking to save AI tokens entirely
              let filteredPhotos: File[] = allExtractedPhotos;

              /* 
               * AI Token Saver Mode:
               * Disabling AI filtering and ranking because passing dozens of 
               * image blobs to Gemini consumes entirely too many tokens and 
               * exhausts free tier limits extremely quickly.
               */
              
              // Update photos with all photos
              setPhotos((prev) => [...prev, ...filteredPhotos]);
              
          }

          if (newPhotos.length === 0 && videosToProcess.length === 0 && pdfsToProcess.length === 0 && textFilesToProcess.length === 0 && filesToProcess.length > 0) {
              alert("Nenhum arquivo compatível encontrado (Imagem, Vídeo, ZIP, PDF ou Texto).");
          }

      } catch (error) {
          console.error(error);
          alert("Erro no processamento de arquivos.");
      } finally {
          setIsProcessingVideo(false);
          setProcessingStatus('');
          if (photoInputRef.current) photoInputRef.current.value = '';
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processFiles(Array.from(e.target.files));
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setLogo(e.target.files[0]);
    }
  };

  const removePhoto = (index: number) => {
    const newPhotos = [...photos];
    newPhotos.splice(index, 1);
    setPhotos(newPhotos);
  };

  const clearAllPhotos = () => {
    if(confirm('Remover todas as fotos?')) setPhotos([]);
  }

  const movePhoto = (index: number, direction: 'left' | 'right') => {
    if (direction === 'left' && index > 0) {
      const newPhotos = [...photos];
      const temp = newPhotos[index];
      newPhotos[index] = newPhotos[index - 1];
      newPhotos[index - 1] = temp;
      setPhotos(newPhotos);
    } else if (direction === 'right' && index < photos.length - 1) {
      const newPhotos = [...photos];
      const temp = newPhotos[index];
      newPhotos[index] = newPhotos[index + 1];
      newPhotos[index + 1] = temp;
      setPhotos(newPhotos);
    }
  };

  const handleEnhance = async (idx: number) => {
    const file = photos[idx];
    setEnhancingIndex(idx);
    try {
      const base64 = await readFileAsDataURL(file);
      const enhancedBase64 = await enhanceImageWithAI(base64);
      if (enhancedBase64) {
        const response = await fetch(enhancedBase64);
        const blob = await response.blob();
        const enhancedFile = new File([blob], file.name, { type: 'image/jpeg' });
        
        const newPhotos = [...photos];
        newPhotos[idx] = enhancedFile;
        setPhotos(newPhotos);
        alert("Foto melhorada com sucesso!");
      }
    } catch (e) {
      alert("Erro ao melhorar foto.");
    } finally {
      setEnhancingIndex(null);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
            <ImageIcon className="text-blue-500" />
            1. Arquivos do Imóvel <span className="text-sm font-normal text-slate-500">({photos.length} fotos)</span>
            </h2>
            {photos.length > 0 && (
                <button onClick={clearAllPhotos} className="text-xs text-red-500 flex items-center gap-1">
                    <XCircle size={14} /> Limpar tudo
                </button>
            )}
        </div>
        
        <div 
          onClick={() => photoInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-8 text-center transition cursor-pointer flex flex-col items-center justify-center min-h-[140px] relative 
            ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:bg-slate-50'} 
            ${isProcessingVideo ? 'opacity-50 pointer-events-none' : ''}`}
        >
          <input 
            type="file" 
            multiple 
            accept="image/*,video/*,.zip,application/zip,application/x-zip-compressed,application/pdf" 
            className="hidden" 
            ref={photoInputRef} 
            onChange={handleFileUpload}
          />
          
          {isProcessingVideo ? (
             <div className="flex flex-col items-center animate-pulse">
                <Loader2 className="w-10 h-10 text-blue-500 mb-2 animate-spin" />
                <p className="text-blue-600 font-bold">{processingStatus}</p>
                <p className="text-xs text-slate-500">Isso pode levar alguns segundos...</p>
             </div>
          ) : (
             <>
                <div className="flex gap-4 mb-3">
                   <ImageIcon className="w-8 h-8 text-slate-400" />
                   <FileType className="w-8 h-8 text-slate-400" /> {/* PDF Icon */}
                   <VideoIcon className="w-8 h-8 text-slate-400" />
                   <Archive className="w-8 h-8 text-slate-400" />
                </div>
                <p className="text-slate-600 font-medium text-lg">Adicionar Fotos, Vídeo, PDF ou ZIP</p>
                <p className="text-slate-400 text-sm mt-1 max-w-sm mx-auto">
                Arraste ou clique. PDFs e arquivos de texto serão lidos automaticamente para extrair dados.
            </p>
            </>
          )}
        </div>

        {/* Data Extraction Success Indicator */}
        {hasExtractedData && (
            <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-100 flex items-center gap-3 animate-bounce-subtle">
                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white shadow-sm">
                    <FileText size={16} />
                </div>
                <div className="text-xs text-green-800">
                    <p className="font-bold">Dados Extraídos com Sucesso!</p>
                    <p>As informações do imóvel foram capturadas e estarão prontas na próxima etapa.</p>
                </div>
            </div>
        )}

        {/* Google Drive Tip */}
        <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-100 flex items-start gap-3">
            <Sparkles className="text-blue-500 shrink-0 mt-0.5" size={16} />
            <div className="text-xs text-blue-800">
                <p className="font-bold mb-1">Dica para Google Drive:</p>
                <p>Baixe a pasta do Drive como um arquivo <strong>ZIP</strong> e arraste-o aqui. O sistema extrairá automaticamente todas as fotos, vídeos e PDFs (incluindo HEIC de iPhones).</p>
            </div>
        </div>

        {photos.length > 0 && (
          <div className="mt-6 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar border-t border-slate-100 pt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {photos.map((file, idx) => (
                <div key={idx} className="relative group aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-100 shadow-sm">
                    <img src={URL.createObjectURL(file)} alt={`p-${idx}`} className="w-full h-full object-cover"/>
                    
                    {file.name.startsWith('frame_') && (
                        <div className="absolute top-1 left-1 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1">
                            <Film size={10} /> Video
                        </div>
                    )}
                     {file.name.startsWith('pdf_') && (
                        <div className="absolute top-1 left-1 bg-red-600/80 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1">
                            <FileType size={10} /> PDF
                        </div>
                    )}

                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all flex flex-col items-center justify-center gap-2">
                        <div className="flex gap-2">
                            <button 
                              onClick={(e) => { e.stopPropagation(); movePhoto(idx, 'left'); }}
                              disabled={idx === 0}
                              className={`p-1.5 rounded-full transition shadow-lg ${idx === 0 ? 'bg-slate-400/50 text-white/50 cursor-not-allowed' : 'bg-slate-800 text-white hover:bg-slate-700'} opacity-0 group-hover:opacity-100`}
                              title="Mover para trás"
                            >
                              <ChevronLeft size={16}/>
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); movePhoto(idx, 'right'); }}
                              disabled={idx === photos.length - 1}
                              className={`p-1.5 rounded-full transition shadow-lg ${idx === photos.length - 1 ? 'bg-slate-400/50 text-white/50 cursor-not-allowed' : 'bg-slate-800 text-white hover:bg-slate-700'} opacity-0 group-hover:opacity-100`}
                              title="Mover para frente"
                            >
                              <ChevronRight size={16}/>
                            </button>
                        </div>
                        <div className="flex gap-2">
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleEnhance(idx); }}
                              disabled={enhancingIndex === idx}
                              className="bg-blue-600 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition shadow-lg hover:bg-blue-700"
                              title="Melhorar Qualidade com IA"
                            >
                              {enhancingIndex === idx ? <Loader2 size={16} className="animate-spin"/> : <Sparkles size={16}/>}
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); removePhoto(idx); }}
                              className="bg-red-500 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition shadow-lg hover:bg-red-600"
                              title="Remover foto"
                            >
                              <Trash2 size={16} />
                            </button>
                        </div>
                    </div>
                    {enhancingIndex === idx && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <span className="text-[10px] text-white font-bold animate-pulse">MELHORANDO...</span>
                      </div>
                    )}
                </div>
                ))}
            </div>
          </div>
        )}
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-xl font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <ImageIcon className="text-blue-500" />
          2. Logomarca do Corretor
        </h2>
        
        <div className="flex items-center gap-6">
          <div 
            onClick={() => logoInputRef.current?.click()}
            className="w-24 h-24 border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center hover:bg-slate-50 cursor-pointer overflow-hidden relative shrink-0"
          >
             <input type="file" accept="image/*" className="hidden" ref={logoInputRef} onChange={handleLogoUpload}/>
              {logo ? (
                <img src={URL.createObjectURL(logo)} alt="Logo" className="w-full h-full object-contain p-2" />
              ) : (
                <>
                  <Upload className="w-6 h-6 text-slate-400 mb-1" />
                  <span className="text-[10px] text-slate-500">Logo</span>
                </>
              )}
          </div>
          <p className="text-sm text-slate-600">A logo será aplicada nas fotos e no rodapé da Ficha Técnica.</p>
        </div>
      </div>

      <div className="flex justify-end pt-4">
        <button
          onClick={onNext}
          disabled={photos.length === 0 || isProcessingVideo}
          className={`px-8 py-4 rounded-lg font-bold text-white transition shadow-xl text-lg flex items-center gap-2 ${
            photos.length === 0 || isProcessingVideo ? 'bg-slate-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {isProcessingVideo ? 'Processando...' : 'Próximo: Dados do Imóvel \u2192'}
        </button>
      </div>
    </div>
  );
};

export default StepUpload;
