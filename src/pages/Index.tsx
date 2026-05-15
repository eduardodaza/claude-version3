import { useState, useEffect } from 'react';
import { Mic, FileText, History, Loader2, AlertCircle, ChevronRight, Trash2, RotateCcw, Copy } from 'lucide-react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { AudioUploaderEnhanced } from '@/components/AudioUploaderEnhanced';
import { TranscriptionProgress } from '@/components/TranscriptionProgress';
import { IntelligentEditor } from '@/components/IntelligentEditor';
import { TemplateManager } from '@/components/TemplateManager';
import { ReportGenerator } from '@/components/ReportGenerator';
import { TranscriptionInput } from '@/components/TranscriptionInput';
import { ReportHistory } from '@/components/ReportHistory';
import { useAudios } from '@/hooks/useAudios';
import { useTranscripciones } from '@/hooks/useTranscripciones';
import { usePlantillas } from '@/hooks/usePlantillas';
import { useInformes } from '@/hooks/useInformes';
import { downloadBlob } from '@/lib/wordGenerator';
import { toast } from 'sonner';
import type { Audio, Transcripcion, Plantilla, InformeWithRelations } from '@/types/database';

type Step = 'upload' | 'transcribing' | 'edit' | 'report';

interface TranscriptionJob {
  file: File;
  status: 'pending' | 'uploading' | 'transcribing' | 'done' | 'error';
  audio?: Audio;
  transcripcion?: Transcripcion;
  error?: string;
}

const Index = () => {
  const [currentStep, setCurrentStep] = useState<Step>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [currentAudio, setCurrentAudio] = useState<Audio | null>(null);
  const [currentTranscripcion, setCurrentTranscripcion] = useState<Transcripcion | null>(null);
  const [textoEditado, setTextoEditado] = useState('');
  const [selectedPlantilla, setSelectedPlantilla] = useState<Plantilla | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('transcribe');
  const [jobs, setJobs] = useState<TranscriptionJob[]>([]);
  const [informesTexto, setInformesTexto] = useState('');

  const { uploadAudio } = useAudios();
  const { transcripciones: allTranscripciones, fetchTranscripciones, updateTextoEditado, deleteAllTranscripciones } = useTranscripciones();
  const { plantillas, fetchPlantillas, uploadPlantilla, deletePlantilla, deletePlantillasBulk, updatePlantilla, downloadPlantilla } = usePlantillas();
  const { informes, fetchInformes, createInforme, deleteInforme, downloadInforme } = useInformes();

  const [isDeletingHistory, setIsDeletingHistory] = useState(false);

  useEffect(() => {
    fetchPlantillas();
    fetchInformes();
    fetchTranscripciones();
  }, [fetchPlantillas, fetchInformes, fetchTranscripciones]);

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setSelectedFiles([file]);
    setError(null);
  };

  const handleFilesSelect = (files: File[]) => {
    setSelectedFiles(prev => [...prev, ...files]);
    if (files.length > 0 && !selectedFile) {
      setSelectedFile(files[0]);
    }
    setError(null);
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(prev => {
      const updated = prev.filter((_, i) => i !== index);
      if (updated.length === 0) {
        setSelectedFile(null);
      }
      return updated;
    });
  };

  const handleClear = () => {
    setSelectedFile(null);
    setSelectedFiles([]);
    setCurrentAudio(null);
    setCurrentTranscripcion(null);
    setTextoEditado('');
    setError(null);
    setCurrentStep('upload');
    setJobs([]);
  };

  const transcribeOneFile = async (file: File, jobIndex: number): Promise<{ audio: Audio; transcripcion: Transcripcion }> => {
    // Update job status: uploading
    setJobs(prev => prev.map((j, i) => i === jobIndex ? { ...j, status: 'uploading' as const } : j));

    const audio = await uploadAudio(file);

    // Update job status: transcribing
    setJobs(prev => prev.map((j, i) => i === jobIndex ? { ...j, status: 'transcribing' as const, audio } : j));

    const response = await fetch(
      '/api/transcribe',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audioId: audio.id,
          storagePath: audio.url_storage,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Error en la transcripción');
    }

    return { audio, transcripcion: data.transcripcion };
  };

  // Combina todas las transcripciones completadas en textoEditado
  const combinarTranscripciones = (updatedJobs: TranscriptionJob[]) => {
    const doneJobs = updatedJobs.filter(j => j.status === 'done' && j.transcripcion);
    if (doneJobs.length === 0) return;
    const lastDone = doneJobs[doneJobs.length - 1];
    setCurrentAudio(lastDone.audio || null);
    setCurrentTranscripcion(lastDone.transcripcion || null);
    if (doneJobs.length === 1) {
      setTextoEditado(lastDone.transcripcion!.texto_editado || lastDone.transcripcion!.texto_original);
    } else {
      const combinedText = doneJobs.map((j) =>
        `--- ${j.file.name} ---\n\n${j.transcripcion!.texto_editado || j.transcripcion!.texto_original}`
      ).join('\n\n');
      setTextoEditado(combinedText);
    }
  };

  // Transcribir UN solo archivo por índice — se queda en la misma pantalla acumulando resultados
  const handleTranscribeOne = async (fileIndex: number) => {
    const file = selectedFiles[fileIndex];
    if (!file || isTranscribing) return;

    setIsTranscribing(true);
    setError(null);

    // Inicializar jobs si no existen aún, manteniendo los ya completados
    setJobs(prev => {
      if (prev.length !== selectedFiles.length) {
        return selectedFiles.map((f, i) => ({
          file: f,
          status: i === fileIndex ? 'uploading' as const : 'pending' as const,
        }));
      }
      return prev.map((j, i) => i === fileIndex ? { ...j, status: 'uploading' as const, error: undefined } : j);
    });

    try {
      const result = await transcribeOneFile(file, fileIndex);
      setJobs(prev => {
        const updated = prev.map((j, i) => i === fileIndex
          ? { ...j, status: 'done' as const, audio: result.audio, transcripcion: result.transcripcion }
          : j
        );
        // Acumular texto — NO saltar a edit, quedarse en upload
        const doneJobs = updated.filter(j => j.status === 'done' && j.transcripcion);
        if (doneJobs.length > 0) {
          const lastDone = doneJobs[doneJobs.length - 1];
          setCurrentAudio(lastDone.audio || null);
          setCurrentTranscripcion(lastDone.transcripcion || null);
          if (doneJobs.length === 1) {
            setTextoEditado(lastDone.transcripcion!.texto_editado || lastDone.transcripcion!.texto_original);
          } else {
            const combinedText = doneJobs.map((j) =>
              `--- ${j.file.name} ---\n\n${j.transcripcion!.texto_editado || j.transcripcion!.texto_original}`
            ).join('\n\n');
            setTextoEditado(combinedText);
          }
        }
        return updated;
      });
      toast.success(`"${file.name}" transcrito`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error desconocido';
      setJobs(prev => prev.map((j, i) => i === fileIndex ? { ...j, status: 'error' as const, error: errorMsg } : j));
      toast.error(`Error al transcribir "${file.name}"`);
    } finally {
      setIsTranscribing(false);
    }
  };

  // Transcribir TODOS los archivos
  const handleTranscribe = async () => {
    const filesToProcess = selectedFiles.length > 0 ? selectedFiles : (selectedFile ? [selectedFile] : []);
    if (filesToProcess.length === 0) return;

    setIsTranscribing(true);
    setError(null);
    setCurrentStep('transcribing');

    const initialJobs: TranscriptionJob[] = filesToProcess.map(file => ({
      file,
      status: 'pending' as const,
    }));
    setJobs(initialJobs);

    const completedTranscriptions: Transcripcion[] = [];
    let lastAudio: Audio | null = null;
    let lastTranscripcion: Transcripcion | null = null;

    for (let i = 0; i < filesToProcess.length; i++) {
      try {
        const result = await transcribeOneFile(filesToProcess[i], i);
        lastAudio = result.audio;
        lastTranscripcion = result.transcripcion;
        completedTranscriptions.push(result.transcripcion);
        setJobs(prev => prev.map((j, idx) => idx === i ? { ...j, status: 'done' as const, audio: result.audio, transcripcion: result.transcripcion } : j));
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Error desconocido';
        setJobs(prev => prev.map((j, idx) => idx === i ? { ...j, status: 'error' as const, error: errorMsg } : j));
        toast.error(`Error al transcribir "${filesToProcess[i].name}"`);
      }
    }

    setJobs(prev => { combinarTranscripciones(prev); return prev; });

    if (completedTranscriptions.length > 0) {
      setCurrentAudio(lastAudio);
      setCurrentTranscripcion(lastTranscripcion);
      setCurrentStep('edit');
      toast.success(
        completedTranscriptions.length === 1
          ? 'Transcripción completada'
          : `${completedTranscriptions.length} transcripciones completadas`
      );
    } else {
      setError('No se pudo transcribir ningún archivo');
      setCurrentStep('upload');
    }

    setIsTranscribing(false);
  };

  const handleRetryJob = async (jobIndex: number) => {
    const job = jobs[jobIndex];
    if (!job || job.status !== 'error') return;

    setJobs(prev => prev.map((j, i) => i === jobIndex ? { ...j, status: 'pending' as const, error: undefined } : j));

    try {
      const result = await transcribeOneFile(job.file, jobIndex);
      setJobs(prev => prev.map((j, i) => i === jobIndex ? { ...j, status: 'done' as const, audio: result.audio, transcripcion: result.transcripcion, error: undefined } : j));
      toast.success(`"${job.file.name}" transcrito correctamente`);

      // Update combined text with all done jobs
      setJobs(prev => {
        const doneJobs = prev.filter(j => j.status === 'done' && j.transcripcion);
        if (doneJobs.length > 0) {
          const lastDone = doneJobs[doneJobs.length - 1];
          setCurrentAudio(lastDone.audio || null);
          setCurrentTranscripcion(lastDone.transcripcion || null);
          if (doneJobs.length === 1) {
            setTextoEditado(lastDone.transcripcion!.texto_editado || lastDone.transcripcion!.texto_original);
          } else {
            const combinedText = doneJobs.map((j) => {
              return `--- ${j.file.name} ---\n\n${j.transcripcion!.texto_editado || j.transcripcion!.texto_original}`;
            }).join('\n\n');
            setTextoEditado(combinedText);
          }
          setCurrentStep('edit');
        }
        return prev;
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error desconocido';
      setJobs(prev => prev.map((j, i) => i === jobIndex ? { ...j, status: 'error' as const, error: errorMsg } : j));
      toast.error(`Error al reintentar "${job.file.name}"`);
    }
  };

  const handleSaveEdit = async () => {
    if (!currentTranscripcion) return;

    setIsSaving(true);
    try {
      await updateTextoEditado(currentTranscripcion.id, textoEditado);
      toast.success('Cambios guardados');
    } catch (err) {
      toast.error('Error al guardar');
    } finally {
      setIsSaving(false);
    }
  };

  const handleGoToReport = () => {
    setActiveTab('informes');
  };

  const handleDeleteHistory = async () => {
    if (!confirm('¿Estás seguro de que deseas eliminar todo el historial de transcripciones? Esta acción no se puede deshacer.')) return;
    setIsDeletingHistory(true);
    try {
      await deleteAllTranscripciones();
      toast.success('Historial de transcripciones eliminado');
    } catch (err) {
      toast.error('Error al eliminar el historial');
    } finally {
      setIsDeletingHistory(false);
    }
  };

  const handleNewReport = () => {
    setInformesTexto('');
  };




  const handleDownloadInforme = async (informe: InformeWithRelations) => {
    try {
      const blob = await downloadInforme(informe);
      if (blob) {
        const fileName = `${informe.nombre_paciente.replace(/\s+/g, '_')}_${informe.tipo_informe.replace(/\s+/g, '_')}.docx`;
        downloadBlob(blob, fileName);
        toast.success('Descarga iniciada');
      }
    } catch (err) {
      toast.error('Error al descargar');
    }
  };

  const handleDeleteInforme = async (informe: InformeWithRelations) => {
    try {
      await deleteInforme(informe);
      toast.success('Informe eliminado');
    } catch (err) {
      toast.error('Error al eliminar');
    }
  };

  const handleUploadPlantilla = async (file: File, nombre: string, descripcion?: string) => {
    try {
      await uploadPlantilla(file, nombre, descripcion);
      toast.success('Plantilla subida');
    } catch (err) {
      toast.error('Error al subir plantilla');
    }
  };

  const handleDeletePlantilla = async (plantilla: Plantilla) => {
    try {
      await deletePlantilla(plantilla);
      if (selectedPlantilla?.id === plantilla.id) {
        setSelectedPlantilla(null);
      }
      toast.success('Plantilla eliminada');
    } catch (err) {
      toast.error('Error al eliminar plantilla');
    }
  };

  const handleDeletePlantillasBulk = async (items: Plantilla[]) => {
    try {
      await deletePlantillasBulk(items);
      if (selectedPlantilla && items.some(p => p.id === selectedPlantilla.id)) {
        setSelectedPlantilla(null);
      }
      toast.success(`${items.length} plantilla${items.length !== 1 ? 's' : ''} eliminada${items.length !== 1 ? 's' : ''}`);
    } catch (err) {
      toast.error('Error al eliminar plantillas');
    }
  };

  const handleUpdatePlantilla = async (id: string, updates: { nombre?: string; descripcion?: string | null }) => {
    try {
      await updatePlantilla(id, updates);
      toast.success('Plantilla actualizada');
    } catch (err) {
      toast.error('Error al actualizar plantilla');
    }
  };

  const handleDownloadPlantilla = async (plantilla: Plantilla) => {
    try {
      const blob = await downloadPlantilla(plantilla);
      downloadBlob(blob, `${plantilla.nombre}.docx`);
      toast.success('Descarga iniciada');
    } catch (err) {
      toast.error('Error al descargar plantilla');
    }
  };

  return (
    <div className="h-[100dvh] w-full max-w-full bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b border-border bg-card safe-top flex-shrink-0">
        <div className="container max-w-6xl mx-auto px-3 sm:px-4 py-2 sm:py-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
              <Mic className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-xl font-bold text-foreground truncate">Transcriptor de Audio</h1>
              <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">Transcripción literal + Editor inteligente</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container max-w-6xl mx-auto w-full min-w-0 px-3 sm:px-4 py-2 sm:py-6 flex-1 overflow-y-auto overflow-x-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full min-w-0">
          <TabsList className="grid w-full grid-cols-3 mb-3 sm:mb-6 h-9 sm:h-11">
            <TabsTrigger value="transcribe" className="min-w-0 gap-1 sm:gap-2 text-xs sm:text-sm px-1 sm:px-3">
              <Mic className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="hidden xs:inline truncate">Transcribir</span>
              <span className="xs:hidden truncate">Audio</span>
            </TabsTrigger>
            <TabsTrigger value="informes" className="min-w-0 gap-1 sm:gap-2 text-xs sm:text-sm px-1 sm:px-3">
              <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="truncate">Informes</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="min-w-0 gap-1 sm:gap-2 text-xs sm:text-sm px-1 sm:px-3">
              <History className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="truncate">Historial</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="transcribe" className="mt-0 w-full min-w-0 overflow-x-hidden">
            {/* Header with delete history */}
            <div className="flex items-center justify-end mb-2 sm:mb-4">
              {allTranscripciones.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDeleteHistory}
                  disabled={isDeletingHistory}
                  className="max-w-full gap-1.5 text-destructive hover:text-destructive text-xs"
                >
                  {isDeletingHistory ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  <span className="hidden sm:inline">Eliminar historial de transcripciones</span>
                  <span className="sm:hidden">Eliminar historial</span>
                </Button>
              )}
            </div>

            {/* Progress Steps */}
            <div className="flex items-center justify-center gap-1 mb-4 sm:mb-8 overflow-x-auto overflow-y-hidden">
              {['upload', 'transcribing', 'edit', 'report'].map((step, index) => (
                <div key={step} className="flex items-center flex-shrink-0">
                  <div
                    className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[10px] sm:text-sm font-medium transition-colors ${
                      currentStep === step
                        ? 'bg-primary text-primary-foreground'
                        : ['upload', 'transcribing', 'edit', 'report'].indexOf(currentStep) > index
                        ? 'bg-primary/20 text-primary'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {index + 1}
                  </div>
                  {index < 3 && (
                    <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4 text-muted-foreground mx-0.5" />
                  )}
                </div>
              ))}
            </div>

            {/* Error Display */}
            {error && (
              <Alert variant="destructive" className="mb-6">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Step: Upload */}
            {currentStep === 'upload' && (
              <div className="space-y-4 sm:space-y-6 w-full min-w-0">
                <div className="text-center mb-2 sm:mb-6">
                  <h2 className="text-base sm:text-2xl font-semibold text-foreground mb-1">
                    Sube tus Audios
                  </h2>
                  <p className="text-[11px] sm:text-sm text-muted-foreground max-w-xl mx-auto px-2">
                    Sube uno o varios archivos de audio para obtener transcripciones literales.
                  </p>
                </div>

                <AudioUploaderEnhanced
                  onFileSelect={handleFileSelect}
                  onFilesSelect={handleFilesSelect}
                  selectedFile={selectedFile}
                  selectedFiles={selectedFiles}
                  onClear={handleClear}
                  onRemoveFile={handleRemoveFile}
                  isProcessing={false}
                  multiple={true}
                />

                {selectedFiles.length > 0 && (
                  <div className="space-y-4">
                    {/* Lista de audios con botón individual + estado */}
                    <div className="space-y-2">
                      {selectedFiles.map((file, index) => {
                        const job = jobs[index];
                        const isDone = job?.status === 'done';
                        const isProcessingThis = job?.status === 'uploading' || job?.status === 'transcribing';
                        const isErr = job?.status === 'error';
                        return (
                          <div key={`${file.name}-${index}`} className={`flex items-center gap-2 p-3 border rounded-lg bg-card transition-colors ${isDone ? 'border-primary/40 bg-primary/5' : isErr ? 'border-destructive/40' : 'border-border'}`}>
                            <div className="flex-shrink-0">
                              {isProcessingThis && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                              {isDone && <span className="text-primary text-sm">✓</span>}
                              {isErr && <AlertCircle className="w-4 h-4 text-destructive" />}
                              {(!job || job.status === 'pending') && <Mic className="w-4 h-4 text-muted-foreground" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{file.name}</p>
                              {isDone && <p className="text-xs text-primary">Transcrito</p>}
                              {isProcessingThis && <p className="text-xs text-muted-foreground">{job.status === 'uploading' ? 'Subiendo...' : 'Transcribiendo...'}</p>}
                              {isErr && <p className="text-xs text-destructive">{job.error}</p>}
                            </div>
                            {!isDone && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleTranscribeOne(index)}
                                disabled={isTranscribing}
                                className="gap-1.5 text-xs flex-shrink-0"
                              >
                                <Mic className="w-3.5 h-3.5" />
                                {isErr ? 'Reintentar' : 'Transcribir'}
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Transcripciones acumuladas con editor inteligente */}
                    {jobs.some(j => j.status === 'done') && currentTranscripcion && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <p className="text-sm font-medium text-foreground">
                            Transcripciones ({jobs.filter(j => j.status === 'done').length}/{selectedFiles.length})
                          </p>
                          <div className="flex gap-2 flex-wrap">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5 text-xs"
                              onClick={handleClear}
                            >
                              ← Nuevo
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5 text-xs"
                              onClick={() => {
                                navigator.clipboard.writeText(textoEditado);
                                toast.success('Copiado al portapapeles');
                              }}
                            >
                              <Copy className="w-3.5 h-3.5" />
                              Copiar todo
                            </Button>
                            <Button size="sm" onClick={handleGoToReport} className="gap-1.5 text-xs">
                              <FileText className="w-3.5 h-3.5" />
                              Ir a Informes
                            </Button>
                          </div>
                        </div>
                        <IntelligentEditor
                          textoOriginal={currentTranscripcion.texto_original}
                          textoEditado={textoEditado}
                          onTextoEditadoChange={setTextoEditado}
                          onSave={handleSaveEdit}
                          isSaving={isSaving}
                        />
                      </div>
                    )}

                    {/* Botón transcribir todos */}
                    <div className="flex justify-center">
                      <Button size="lg" onClick={handleTranscribe} disabled={isTranscribing} className="max-w-full gap-2 px-5 sm:px-8 text-sm sm:text-base">
                        <Mic className="w-5 h-5 shrink-0" />
                        <span className="truncate">
                          {selectedFiles.length === 1
                            ? 'Transcribir Audio'
                            : `Transcribir todos (${selectedFiles.length})`}
                        </span>
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step: Transcribing */}
            {currentStep === 'transcribing' && (
              <div className="space-y-4 w-full min-w-0">
                {jobs.map((job, index) => (
                  <div key={index} className="w-full min-w-0 p-4 border border-border rounded-xl bg-card">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                        job.status === 'done' && 'bg-primary/10 text-primary',
                        job.status === 'error' && 'bg-destructive/10 text-destructive',
                        (job.status === 'uploading' || job.status === 'transcribing') && 'bg-primary/10 text-primary',
                        job.status === 'pending' && 'bg-muted text-muted-foreground',
                      )}>
                        {(job.status === 'uploading' || job.status === 'transcribing') && (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        )}
                        {job.status === 'done' && <span className="text-sm">✓</span>}
                        {job.status === 'error' && <AlertCircle className="w-4 h-4" />}
                        {job.status === 'pending' && <span className="text-xs">{index + 1}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground text-sm truncate">{job.file.name}</p>
                        <p className="text-xs text-muted-foreground break-words">
                          {job.status === 'pending' && 'En espera...'}
                          {job.status === 'uploading' && 'Subiendo archivo...'}
                          {job.status === 'transcribing' && 'Transcribiendo...'}
                          {job.status === 'done' && 'Completado'}
                          {job.status === 'error' && (job.error || 'Error')}
                        </p>
                      </div>
                      {job.status === 'error' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRetryJob(index)}
                          className="gap-1.5 flex-shrink-0 text-xs"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Reintentar</span>
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {!isTranscribing && (
                  <div className="flex justify-center">
                    <Button variant="outline" onClick={handleClear} className="gap-2 max-w-full">
                      ← Volver al inicio
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Step: Edit */}
            {currentStep === 'edit' && currentTranscripcion && (
              <div className="space-y-4 sm:space-y-6 w-full min-w-0">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 min-w-0">
                  <h2 className="text-lg sm:text-xl font-semibold text-foreground">
                    Edita la Transcripción
                  </h2>
                  <div className="flex gap-2 w-full sm:w-auto min-w-0">
                    <Button variant="outline" onClick={handleClear} className="gap-1.5 flex-1 sm:flex-none text-xs sm:text-sm min-w-0">
                      ← Nuevo
                    </Button>
                    <Button onClick={handleGoToReport} className="gap-1.5 flex-1 sm:flex-none text-xs sm:text-sm min-w-0">
                      <FileText className="w-4 h-4 shrink-0" />
                      <span className="truncate">Informe</span>
                    </Button>
                  </div>
                </div>

                <IntelligentEditor
                  textoOriginal={currentTranscripcion.texto_original}
                  textoEditado={textoEditado}
                  onTextoEditadoChange={setTextoEditado}
                  onSave={handleSaveEdit}
                  isSaving={isSaving}
                />
              </div>
            )}

            {/* Step: Report - redirects to Informes tab */}
            {currentStep === 'report' && (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">
                  Continúa en la pestaña Informes para generar los documentos Word.
                </p>
                <Button onClick={handleGoToReport} className="gap-2 max-w-full">
                  <FileText className="w-4 h-4 shrink-0" />
                  <span className="truncate">Ir a Informes</span>
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="informes" className="mt-0 w-full min-w-0 overflow-x-hidden">
            {/* Desktop: resizable panels */}
            <div className="hidden lg:block w-full min-w-0">
              <ResizablePanelGroup direction="horizontal" className="min-h-[500px] rounded-xl border border-border">
                <ResizablePanel defaultSize={33} minSize={20} maxSize={50}>
                  <div className="h-full overflow-auto p-4">
                    <TemplateManager
                      plantillas={plantillas}
                      onUpload={handleUploadPlantilla}
                      onDelete={handleDeletePlantilla}
                      onDeleteBulk={handleDeletePlantillasBulk}
                      onDownload={handleDownloadPlantilla}
                      onUpdate={handleUpdatePlantilla}
                      onSelect={setSelectedPlantilla}
                      selectedPlantilla={selectedPlantilla}
                      isLoading={false}
                    />
                  </div>
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={67} minSize={40}>
                  <div className="h-full overflow-auto p-4 space-y-4 sm:space-y-6">
                    {informesTexto.trim() && (
                      <div className="flex justify-end">
                        <Button variant="outline" size="sm" onClick={handleNewReport} className="gap-1.5 text-xs sm:text-sm max-w-full">
                          <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">Nuevo Informe</span>
                        </Button>
                      </div>
                    )}
                    <div className="border border-border rounded-xl bg-card p-3 sm:p-6 min-w-0 overflow-hidden">
                      <TranscriptionInput
                        value={informesTexto}
                        onChange={setInformesTexto}
                      />
                    </div>
                    <div className="border border-border rounded-xl bg-card p-3 sm:p-6 min-w-0 overflow-hidden">
                      <h3 className="font-semibold text-foreground mb-3 sm:mb-4 text-sm sm:text-base">Generar Informes Word</h3>
                      <ReportGenerator
                        textoFinal={informesTexto}
                        plantillas={plantillas}
                        downloadPlantilla={downloadPlantilla}
                      />
                    </div>
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            </div>
            {/* Mobile: stacked layout */}
            <div className="lg:hidden grid gap-4 w-full min-w-0">
              <div className="min-w-0">
                <TemplateManager
                  plantillas={plantillas}
                  onUpload={handleUploadPlantilla}
                  onDelete={handleDeletePlantilla}
                  onDeleteBulk={handleDeletePlantillasBulk}
                  onDownload={handleDownloadPlantilla}
                  onUpdate={handleUpdatePlantilla}
                  onSelect={setSelectedPlantilla}
                  selectedPlantilla={selectedPlantilla}
                  isLoading={false}
                />
              </div>
              <div className="space-y-4 min-w-0">
                {informesTexto.trim() && (
                  <div className="flex justify-end">
                    <Button variant="outline" size="sm" onClick={handleNewReport} className="gap-1.5 text-xs sm:text-sm max-w-full">
                      <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">Nuevo Informe</span>
                    </Button>
                  </div>
                )}
                <div className="border border-border rounded-xl bg-card p-3 sm:p-6 min-w-0 overflow-hidden">
                  <TranscriptionInput
                    value={informesTexto}
                    onChange={setInformesTexto}
                  />
                </div>
                <div className="border border-border rounded-xl bg-card p-3 sm:p-6 min-w-0 overflow-hidden">
                  <h3 className="font-semibold text-foreground mb-3 sm:mb-4 text-sm sm:text-base">Generar Informes Word</h3>
                  <ReportGenerator
                    textoFinal={informesTexto}
                    plantillas={plantillas}
                    downloadPlantilla={downloadPlantilla}
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="history" className="mt-0 w-full min-w-0 overflow-x-hidden">
            <div className="border border-border rounded-xl bg-card p-3 sm:p-6 min-w-0 overflow-hidden">
              <h2 className="text-lg sm:text-xl font-semibold text-foreground mb-3 sm:mb-4">
                Historial de Informes
              </h2>
              <ReportHistory
                informes={informes}
                onDownload={handleDownloadInforme}
                onDelete={handleDeleteInforme}
                isLoading={false}
              />
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t border-border flex-shrink-0 safe-bottom">
        <div className="container max-w-6xl mx-auto px-3 sm:px-4 py-1.5 sm:py-4">
          <p className="text-center text-[10px] sm:text-sm text-muted-foreground">
            Transcripción literal • Editor inteligente • Exportación a Word
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
