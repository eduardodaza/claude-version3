import { useState, useMemo } from 'react';
import { FileText, Download, Loader2, PackageOpen, AlertTriangle, RefreshCw, Search, ListPlus, Zap, Hand } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { modifyTemplate } from '@/lib/templateModifier';
import type { Plantilla } from '@/types/database';

interface ParsedStudy {
  nombre_paciente: string;
  tipo_estudio: string;
  region: string;
  lateralidad: string | null;
  es_contrastado: boolean;
  hallazgos: string;
  conclusiones: string;
  datos_clinicos: string;
  plantilla_match: string | null;
  nombre_archivo_sugerido: string;
}

interface GeneratedReport {
  study: ParsedStudy;
  blob: Blob | null;
  fileName: string;
  status: 'pending' | 'generating' | 'done' | 'error';
  error?: string;
  manualPlantillaId?: string;
  isRetrying?: boolean;
}

interface ReportGeneratorProps {
  textoFinal: string;
  plantillas: Plantilla[];
  downloadPlantilla: (plantilla: Plantilla) => Promise<Blob>;
}

// ─── TemplatePicker ────────────────────────────────────────────────────────────
function TemplatePicker({
  plantillas,
  selectedId,
  onSelect,
  onRetry,
  canRetry,
  label = 'Generar',
}: {
  plantillas: Plantilla[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onRetry: () => void;
  canRetry: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return plantillas;
    const q = search.toLowerCase();
    return plantillas.filter(p => p.nombre.toLowerCase().includes(q));
  }, [plantillas, search]);

  const selectedName = plantillas.find(p => p.id === selectedId)?.nombre;

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 text-xs flex-1 justify-start font-normal truncate">
            {selectedName || 'Seleccionar plantilla...'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-2" align="start">
          <div className="flex items-center gap-2 mb-2">
            <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <Input
              placeholder="Buscar plantilla..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 text-xs"
              autoFocus
            />
          </div>
          <ScrollArea className="max-h-[200px]">
            <div className="space-y-0.5">
              {filtered.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">Sin resultados</p>
              )}
              {filtered.map(p => (
                <button
                  key={p.id}
                  className={`w-full text-left text-xs px-2 py-1.5 rounded hover:bg-accent transition-colors ${p.id === selectedId ? 'bg-accent font-medium' : ''}`}
                  onClick={() => {
                    onSelect(p.id);
                    setOpen(false);
                    setSearch('');
                  }}
                >
                  {p.nombre}
                </button>
              ))}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1 text-xs whitespace-nowrap"
        disabled={!canRetry}
        onClick={onRetry}
      >
        <ListPlus className="w-3.5 h-3.5" />
        {label}
      </Button>
    </div>
  );
}

// ─── ManualStudyRow ────────────────────────────────────────────────────────────
// Fila para modo manual: muestra el estudio detectado y el cajón de selección
function ManualStudyRow({
  study,
  plantillas,
  selectedId,
  onSelect,
}: {
  study: ParsedStudy;
  plantillas: Plantilla[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return plantillas;
    const q = search.toLowerCase();
    return plantillas.filter(p => p.nombre.toLowerCase().includes(q));
  }, [plantillas, search]);

  const selectedName = plantillas.find(p => p.id === selectedId)?.nombre;

  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg border border-border bg-background">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{study.nombre_paciente}</p>
        <p className="text-xs text-muted-foreground truncate">
          {study.tipo_estudio} {study.region}
          {study.lateralidad ? ` - ${study.lateralidad}` : ''}
        </p>
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={`h-8 text-xs w-full justify-start font-normal truncate ${selectedId ? 'border-primary text-primary' : ''}`}
          >
            {selectedName || 'Seleccionar plantilla...'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-2" align="start">
          <div className="flex items-center gap-2 mb-2">
            <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <Input
              placeholder="Buscar plantilla..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 text-xs"
              autoFocus
            />
          </div>
          <ScrollArea className="max-h-[200px]">
            <div className="space-y-0.5">
              {filtered.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">Sin resultados</p>
              )}
              {filtered.map(p => (
                <button
                  key={p.id}
                  className={`w-full text-left text-xs px-2 py-1.5 rounded hover:bg-accent transition-colors ${p.id === selectedId ? 'bg-accent font-medium' : ''}`}
                  onClick={() => {
                    onSelect(p.id);
                    setOpen(false);
                    setSearch('');
                  }}
                >
                  {p.nombre}
                </button>
              ))}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ─── ReportGenerator ───────────────────────────────────────────────────────────
export function ReportGenerator({
  textoFinal,
  plantillas,
  downloadPlantilla,
}: ReportGeneratorProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [reports, setReports] = useState<GeneratedReport[]>([]);
  const [unmatchedStudies, setUnmatchedStudies] = useState<string[]>([]);
  const [step, setStep] = useState<'idle' | 'parsing' | 'manual-select' | 'generating' | 'done'>('idle');

  // Modo: 'auto' = Groq detecta plantilla | 'manual' = usuario selecciona por estudio
  const [modo, setModo] = useState<'auto' | 'manual'>('auto');

  // Para modo manual: estudios parseados antes de generar + plantillas seleccionadas
  const [estudiosManual, setEstudiosManual] = useState<ParsedStudy[]>([]);
  const [seleccionManual, setSeleccionManual] = useState<Record<number, string>>({});

  // ── Parsear transcripción (común a ambos modos) ────────────────────────────
  const parsearTranscripcion = async (modoManual: boolean = false): Promise<ParsedStudy[]> => {
    const templateNames = modoManual ? [] : plantillas.map(p => p.nombre);
    const response = await fetch('/api/parse-transcription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcriptionText: textoFinal, templateNames, modoManual }),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Error al analizar la transcripción');
    }
    const parsed = await response.json();
    setUnmatchedStudies(parsed.estudios_sin_match || []);
    return parsed.estudios || [];
  };

  // ── Generar documentos Word a partir de estudios ya parseados ─────────────
  const generarDocumentos = async (studies: ParsedStudy[], plantillasPorEstudio?: Record<number, string>) => {
    setStep('generating');

    const initialReports: GeneratedReport[] = studies.map((study, i) => {
      // En modo manual usamos la plantilla seleccionada por el usuario
      const plantillaId = plantillasPorEstudio?.[i];
      const plantillaSeleccionada = plantillaId ? plantillas.find(p => p.id === plantillaId) : null;
      const plantillaMatchFinal = plantillaSeleccionada ? plantillaSeleccionada.nombre : study.plantilla_match;

      return {
        study: { ...study, plantilla_match: plantillaMatchFinal },
        blob: null,
       fileName: `${study.nombre_archivo_sugerido || study.nombre_paciente}${study.lateralidad ? ` ${study.lateralidad}` : ''}_${i + 1}.docx`,
        status: plantillaMatchFinal ? 'pending' as const : 'error' as const,
        error: plantillaMatchFinal ? undefined : 'No se encontró plantilla correspondiente',
      };
    });

    setReports(initialReports);

    for (let i = 0; i < initialReports.length; i++) {
      const report = initialReports[i];
      if (report.status === 'error') continue;

      setReports(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'generating' as const } : r));

      try {
        const matchedPlantilla = plantillas.find(p => p.nombre === report.study.plantilla_match);
        if (!matchedPlantilla) throw new Error('Plantilla no encontrada en la lista');

        const templateBlob = await downloadPlantilla(matchedPlantilla);
        const modifiedBlob = await modifyTemplate(templateBlob, {
          nombre_paciente: report.study.nombre_paciente,
          tipo_estudio: report.study.tipo_estudio,
          region: report.study.region,
          lateralidad: report.study.lateralidad,
          hallazgos: report.study.hallazgos,
          conclusiones: report.study.conclusiones,
          datos_clinicos: report.study.datos_clinicos,
        });

        setReports(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'done' as const, blob: modifiedBlob } : r));
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Error al generar';
        setReports(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'error' as const, error: errorMsg } : r));
      }
    }

    setStep('done');
    toast.success('Proceso completado');
  };

  // ── MODO AUTOMÁTICO ────────────────────────────────────────────────────────
  const handleGenerateAuto = async () => {
    if (!textoFinal.trim()) return;
    setIsProcessing(true);
    setStep('parsing');
    setReports([]);
    setUnmatchedStudies([]);

    try {
      const studies = await parsearTranscripcion();
      if (studies.length === 0) {
        toast.error('No se identificaron estudios en la transcripción');
        setStep('idle');
        return;
      }
      await generarDocumentos(studies);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al procesar');
      setStep('idle');
    } finally {
      setIsProcessing(false);
    }
  };

  // ── MODO MANUAL: paso 1 — parsear y mostrar estudios con cajones ──────────
  const handleParsearManual = async () => {
    if (!textoFinal.trim()) return;
    setIsProcessing(true);
    setStep('parsing');
    setReports([]);
    setUnmatchedStudies([]);
    setSeleccionManual({});

    try {
      const studies = await parsearTranscripcion(true);
      if (studies.length === 0) {
        toast.error('No se identificaron estudios en la transcripción');
        setStep('idle');
        return;
      }
      setEstudiosManual(studies);
      setStep('manual-select');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al analizar');
      setStep('idle');
    } finally {
      setIsProcessing(false);
    }
  };

  // ── MODO MANUAL: paso 2 — generar con plantillas seleccionadas ────────────
  const handleGenerarManual = async () => {
    const sinPlantilla = estudiosManual.some((_, i) => !seleccionManual[i]);
    if (sinPlantilla) {
      toast.error('Selecciona una plantilla para cada estudio antes de generar');
      return;
    }
    setIsProcessing(true);
    try {
      await generarDocumentos(estudiosManual, seleccionManual);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al generar');
      setStep('idle');
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Reintentar con otra plantilla (para errores en lista de resultados) ────
  const handleRetryWithTemplate = async (index: number) => {
    const report = reports[index];
    if (!report.manualPlantillaId) {
      toast.error('Selecciona una plantilla primero');
      return;
    }
    const selectedPlantilla = plantillas.find(p => p.id === report.manualPlantillaId);
    if (!selectedPlantilla) return;

    setReports(prev => prev.map((r, idx) => idx === index ? { ...r, status: 'generating' as const, error: undefined } : r));

    try {
      const templateBlob = await downloadPlantilla(selectedPlantilla);
      const modifiedBlob = await modifyTemplate(templateBlob, {
        nombre_paciente: report.study.nombre_paciente,
        tipo_estudio: report.study.tipo_estudio,
        region: report.study.region,
        lateralidad: report.study.lateralidad,
        hallazgos: report.study.hallazgos,
        conclusiones: report.study.conclusiones,
        datos_clinicos: report.study.datos_clinicos,
      });
      const fileName = `${report.study.nombre_paciente} ${selectedPlantilla.nombre}.docx`;
      setReports(prev => prev.map((r, idx) => idx === index ? { ...r, status: 'done' as const, blob: modifiedBlob, fileName, isRetrying: false, manualPlantillaId: undefined } : r));
      toast.success(`Informe generado: ${report.study.nombre_paciente}`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error al generar';
      setReports(prev => prev.map((r, idx) => idx === index ? { ...r, status: 'error' as const, error: errorMsg } : r));
    }
  };

  const handleDownloadOne = (report: GeneratedReport) => {
    if (report.blob) saveAs(report.blob, report.fileName);
  };

  const handleDownloadAll = async () => {
    const successReports = reports.filter(r => r.status === 'done' && r.blob);
    if (successReports.length === 0) return;
    if (successReports.length === 1) { handleDownloadOne(successReports[0]); return; }
    const zip = new JSZip();
    successReports.forEach(r => { if (r.blob) zip.file(r.fileName, r.blob); });
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    saveAs(zipBlob, 'Informes.zip');
  };

  const successCount = reports.filter(r => r.status === 'done').length;
  const errorCount = reports.filter(r => r.status === 'error').length;
  const todasSeleccionadas = estudiosManual.length > 0 && estudiosManual.every((_, i) => !!seleccionManual[i]);

  return (
    <div className="space-y-4">

      {/* ── Selector de modo ── */}
      {step === 'idle' && (
        <div className="flex gap-2 p-1 bg-muted rounded-lg">
          <button
            onClick={() => setModo('auto')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              modo === 'auto' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Zap className="w-4 h-4" />
            Automático
          </button>
          <button
            onClick={() => setModo('manual')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              modo === 'manual' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Hand className="w-4 h-4" />
            Manual
          </button>
        </div>
      )}

      {/* ── Descripción del modo ── */}
      {step === 'idle' && (
        <p className="text-xs text-muted-foreground text-center">
          {modo === 'auto'
            ? 'La IA detecta automáticamente la plantilla para cada estudio.'
            : 'La IA extrae los datos y tú seleccionas la plantilla de cada estudio.'}
        </p>
      )}

      {/* ── Botón principal ── */}
      {(step === 'idle' || step === 'parsing') && (
        <Button
          onClick={modo === 'auto' ? handleGenerateAuto : handleParsearManual}
          disabled={!textoFinal.trim() || isProcessing}
          className="w-full gap-2"
          size="lg"
        >
          {isProcessing && step === 'parsing' ? (
            <><Loader2 className="w-5 h-5 animate-spin" />Analizando transcripción...</>
          ) : (
            <><FileText className="w-5 h-5" />
              {modo === 'auto' ? 'Generar Informes y Descargar Word' : 'Analizar Transcripción'}
            </>
          )}
        </Button>
      )}

      {/* ── MODO MANUAL: cajones de selección por estudio ── */}
      {step === 'manual-select' && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">
            Se detectaron {estudiosManual.length} estudio{estudiosManual.length !== 1 ? 's' : ''}. Selecciona la plantilla para cada uno:
          </p>
          <ScrollArea className="max-h-[320px]">
            <div className="space-y-2 pr-3">
              {estudiosManual.map((study, i) => (
                <ManualStudyRow
                  key={i}
                  study={study}
                  plantillas={plantillas}
                  selectedId={seleccionManual[i]}
                  onSelect={(id) => setSeleccionManual(prev => ({ ...prev, [i]: id }))}
                />
              ))}
            </div>
          </ScrollArea>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setStep('idle'); setEstudiosManual([]); setSeleccionManual({}); }}
              disabled={isProcessing}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1 gap-2"
              onClick={handleGenerarManual}
              disabled={!todasSeleccionadas || isProcessing}
            >
              {isProcessing ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Generando...</>
              ) : (
                <><FileText className="w-4 h-4" />Generar Informes</>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ── Lista de resultados ── */}
      {reports.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">
              {step === 'generating'
                ? 'Generando informes...'
                : `${successCount} informe${successCount !== 1 ? 's' : ''} generado${successCount !== 1 ? 's' : ''}${errorCount > 0 ? `, ${errorCount} con error` : ''}`}
            </p>
            {successCount > 0 && step === 'done' && (
              <Button variant="outline" size="sm" onClick={handleDownloadAll} className="gap-2">
                <PackageOpen className="w-4 h-4" />
                {successCount > 1 ? 'Descargar todos (ZIP)' : 'Descargar'}
              </Button>
            )}
          </div>

          <ScrollArea className="h-[600px]">
            <div className="space-y-2 pr-3">
              {reports.map((report, index) => (
                <div key={index} className="flex flex-col gap-2 p-3 rounded-lg border border-border bg-background">
                  <div className="flex items-center gap-3">
                    {report.status === 'done' && report.blob && (
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDownloadOne(report)}>
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setReports(prev => prev.map((r, idx) => idx === index ? { ...r, isRetrying: !r.isRetrying, manualPlantillaId: undefined } : r))}
                        >
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                    <div className="flex-shrink-0">
                      {report.status === 'generating' && <Loader2 className="w-5 h-5 animate-spin text-primary" />}
                      {report.status === 'error' && <AlertTriangle className="w-5 h-5 text-destructive" />}
                      {report.status === 'pending' && <FileText className="w-5 h-5 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{report.study.nombre_paciente}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {report.study.tipo_estudio} {report.study.region}
                        {report.study.lateralidad ? ` - ${report.study.lateralidad}` : ''}
                        {report.study.plantilla_match ? ` → ${report.study.plantilla_match}` : ''}
                      </p>
                      {report.error && <p className="text-xs text-destructive mt-1">{report.error}</p>}
                    </div>
                  </div>

                  {report.status === 'done' && report.isRetrying && (
                    <TemplatePicker
                      plantillas={plantillas}
                      selectedId={report.manualPlantillaId}
                      onSelect={(id) => setReports(prev => prev.map((r, idx) => idx === index ? { ...r, manualPlantillaId: id } : r))}
                      onRetry={() => handleRetryWithTemplate(index)}
                      canRetry={!!report.manualPlantillaId}
                      label="Regenerar"
                    />
                  )}

                  {report.status === 'error' && (
                    <TemplatePicker
                      plantillas={plantillas}
                      selectedId={report.manualPlantillaId}
                      onSelect={(id) => setReports(prev => prev.map((r, idx) => idx === index ? { ...r, manualPlantillaId: id } : r))}
                      onRetry={() => handleRetryWithTemplate(index)}
                      canRetry={!!report.manualPlantillaId}
                    />
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* ── Volver a generar tras completar ── */}
      {step === 'done' && (
        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={() => { setStep('idle'); setReports([]); setEstudiosManual([]); setSeleccionManual({}); setUnmatchedStudies([]); }}
        >
          <RefreshCw className="w-4 h-4" />
          Generar nuevos informes
        </Button>
      )}

      {unmatchedStudies.length > 0 && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
          <p className="text-sm font-medium text-destructive mb-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Estudios sin plantilla correspondiente:
          </p>
          <ul className="text-xs text-destructive/80 space-y-1">
            {unmatchedStudies.map((s, i) => <li key={i}>• {s}</li>)}
          </ul>
        </div>
      )}

      {!textoFinal.trim() && step === 'idle' && (
        <p className="text-sm text-muted-foreground text-center">
          Pega o selecciona una transcripción arriba para generar los informes.
        </p>
      )}
    </div>
  );
}
