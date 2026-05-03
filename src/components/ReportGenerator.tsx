import { useState, useMemo } from 'react';
import { FileText, Download, Loader2, PackageOpen, AlertTriangle, RefreshCw, Search, ListPlus, Zap, Hand, CheckCircle2 } from 'lucide-react';
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

// Estado por estudio en modo manual
interface ManualStudyState {
  study: ParsedStudy;
  plantillaId: string | undefined;
  status: 'idle' | 'generating' | 'done' | 'error';
  blob: Blob | null;
  fileName: string;
  error?: string;
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
                  onClick={() => { onSelect(p.id); setOpen(false); setSearch(''); }}
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

// ─── ManualStudyRow (nuevo: con botón Generar individual y estado propio) ──────
function ManualStudyRow({
  item,
  index,
  plantillas,
  onSelectPlantilla,
  onGenerar,
  onDownload,
}: {
  item: ManualStudyState;
  index: number;
  plantillas: Plantilla[];
  onSelectPlantilla: (index: number, id: string) => void;
  onGenerar: (index: number) => void;
  onDownload: (index: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return plantillas;
    const q = search.toLowerCase();
    return plantillas.filter(p => p.nombre.toLowerCase().includes(q));
  }, [plantillas, search]);

  const selectedName = plantillas.find(p => p.id === item.plantillaId)?.nombre;
  const isDone = item.status === 'done';
  const isGenerating = item.status === 'generating';
  const isError = item.status === 'error';

  return (
    <div className={`flex flex-col gap-2 p-3 rounded-lg border bg-background transition-colors ${
      isDone ? 'border-primary/40 bg-primary/5' : isError ? 'border-destructive/40' : 'border-border'
    }`}>
      {/* Cabecera del estudio */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex-shrink-0">
          {isDone && <CheckCircle2 className="w-4 h-4 text-primary" />}
          {isGenerating && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
          {isError && <AlertTriangle className="w-4 h-4 text-destructive" />}
          {item.status === 'idle' && <FileText className="w-4 h-4 text-muted-foreground" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{item.study.nombre_paciente}</p>
          <p className="text-xs text-muted-foreground truncate">
            {item.study.tipo_estudio} {item.study.region}
            {item.study.lateralidad ? ` · ${item.study.lateralidad}` : ''}
          </p>
        </div>
        {isDone && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 flex-shrink-0"
            onClick={() => onDownload(index)}
            title="Descargar este informe"
          >
            <Download className="w-4 h-4" />
          </Button>
        )}
      </div>

      {isError && (
        <p className="text-xs text-destructive">{item.error}</p>
      )}

      {/* Selector de plantilla + botón Generar individual */}
      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={`h-8 text-xs flex-1 justify-start font-normal truncate ${item.plantillaId ? 'border-primary/50 text-primary' : ''}`}
              disabled={isGenerating}
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
                    className={`w-full text-left text-xs px-2 py-1.5 rounded hover:bg-accent transition-colors ${p.id === item.plantillaId ? 'bg-accent font-medium' : ''}`}
                    onClick={() => { onSelectPlantilla(index, p.id); setOpen(false); setSearch(''); }}
                  >
                    {p.nombre}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>

        <Button
          size="sm"
          className="h-8 text-xs gap-1 whitespace-nowrap"
          disabled={!item.plantillaId || isGenerating}
          onClick={() => onGenerar(index)}
        >
          {isGenerating ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : isDone ? (
            <><RefreshCw className="w-3.5 h-3.5" />Regenerar</>
          ) : (
            <><FileText className="w-3.5 h-3.5" />Generar</>
          )}
        </Button>
      </div>
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
  const [modo, setModo] = useState<'auto' | 'manual'>('auto');

  // Estado modo manual: un item por estudio con su propio estado
  const [estudiosManual, setEstudiosManual] = useState<ManualStudyState[]>([]);

  // ── Parsear transcripción ─────────────────────────────────────────────────
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

  // ── Generar documentos (modo auto) ────────────────────────────────────────
  const generarDocumentos = async (studies: ParsedStudy[], plantillasPorEstudio?: Record<number, string>) => {
    setStep('generating');

    const initialReports: GeneratedReport[] = studies.map((study, i) => {
      const plantillaId = plantillasPorEstudio?.[i];
      const plantillaSeleccionada = plantillaId ? plantillas.find(p => p.id === plantillaId) : null;
      const plantillaMatchFinal = plantillaSeleccionada ? plantillaSeleccionada.nombre : study.plantilla_match;
      return {
        study: { ...study, plantilla_match: plantillaMatchFinal },
        blob: null,
        fileName: `${study.nombre_archivo_sugerido || study.nombre_paciente}_${i + 1}.docx`,
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

  // ── MODO MANUAL paso 1: parsear ───────────────────────────────────────────
  const handleParsearManual = async () => {
    if (!textoFinal.trim()) return;
    setIsProcessing(true);
    setStep('parsing');
    setReports([]);
    setUnmatchedStudies([]);
    setEstudiosManual([]);

    try {
      const studies = await parsearTranscripcion(true);
      if (studies.length === 0) {
        toast.error('No se identificaron estudios en la transcripción');
        setStep('idle');
        return;
      }
      setEstudiosManual(studies.map((study, i) => ({
        study,
        plantillaId: undefined,
        status: 'idle' as const,
        blob: null,
        fileName: `${study.nombre_archivo_sugerido || study.nombre_paciente}_${i + 1}.docx`,
      })));
      setStep('manual-select');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al analizar');
      setStep('idle');
    } finally {
      setIsProcessing(false);
    }
  };

  // ── MODO MANUAL: seleccionar plantilla por estudio ────────────────────────
  const handleSelectPlantilla = (index: number, plantillaId: string) => {
    setEstudiosManual(prev => prev.map((item, i) => i === index ? { ...item, plantillaId } : item));
  };

  // ── MODO MANUAL: generar UN estudio individual ────────────────────────────
  const handleGenerarUno = async (index: number) => {
    const item = estudiosManual[index];
    if (!item.plantillaId) return;

    const plantilla = plantillas.find(p => p.id === item.plantillaId);
    if (!plantilla) return;

    setEstudiosManual(prev => prev.map((it, i) => i === index ? { ...it, status: 'generating' as const, error: undefined } : it));

    try {
      const templateBlob = await downloadPlantilla(plantilla);
      const modifiedBlob = await modifyTemplate(templateBlob, {
        nombre_paciente: item.study.nombre_paciente,
        tipo_estudio: item.study.tipo_estudio,
        region: item.study.region,
        lateralidad: item.study.lateralidad,
        hallazgos: item.study.hallazgos,
        conclusiones: item.study.conclusiones,
        datos_clinicos: item.study.datos_clinicos,
      });
      const fileName = `${item.study.nombre_archivo_sugerido || item.study.nombre_paciente} - ${plantilla.nombre}.docx`;
      setEstudiosManual(prev => prev.map((it, i) => i === index ? { ...it, status: 'done' as const, blob: modifiedBlob, fileName } : it));
      toast.success(`Informe generado: ${item.study.nombre_paciente}`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error al generar';
      setEstudiosManual(prev => prev.map((it, i) => i === index ? { ...it, status: 'error' as const, error: errorMsg } : it));
      toast.error(`Error: ${item.study.nombre_paciente}`);
    }
  };

  // ── MODO MANUAL: descargar uno ────────────────────────────────────────────
  const handleDownloadUno = (index: number) => {
    const item = estudiosManual[index];
    if (item.blob) saveAs(item.blob, item.fileName);
  };

  // ── MODO MANUAL: descargar todos los que ya están listos ─────────────────
  const handleDownloadListos = async () => {
    const listos = estudiosManual.filter(it => it.status === 'done' && it.blob);
    if (listos.length === 0) return;
    if (listos.length === 1) {
      saveAs(listos[0].blob!, listos[0].fileName);
      return;
    }
    const zip = new JSZip();
    listos.forEach(it => { if (it.blob) zip.file(it.fileName, it.blob); });
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    saveAs(zipBlob, 'Informes.zip');
  };

  // ── Reintentar con otra plantilla (modo auto, errores) ────────────────────
  const handleRetryWithTemplate = async (index: number) => {
    const report = reports[index];
    if (!report.manualPlantillaId) { toast.error('Selecciona una plantilla primero'); return; }
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

  // Contadores modo manual
  const listosCount = estudiosManual.filter(it => it.status === 'done').length;
  const conPlantillaCount = estudiosManual.filter(it => !!it.plantillaId).length;

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

      {/* ── MODO MANUAL: lista de estudios con generación individual ── */}
      {step === 'manual-select' && (
        <div className="space-y-3 flex flex-col">
          {/* Cabecera con contadores y botón descargar listos */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm font-medium text-foreground">
              {estudiosManual.length} estudio{estudiosManual.length !== 1 ? 's' : ''} detectado{estudiosManual.length !== 1 ? 's' : ''}
              {listosCount > 0 && (
                <span className="ml-2 text-primary">· {listosCount} listo{listosCount !== 1 ? 's' : ''}</span>
              )}
            </p>
            <div className="flex gap-2">
              {listosCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={handleDownloadListos}
                >
                  <PackageOpen className="w-3.5 h-3.5" />
                  {listosCount === 1
                    ? 'Descargar listo'
                    : `Descargar ${listosCount} listos (ZIP)`}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setStep('idle'); setEstudiosManual([]); }}
                disabled={estudiosManual.some(it => it.status === 'generating')}
              >
                Cancelar
              </Button>
            </div>
          </div>

          <ScrollArea className="h-[480px] overflow-y-auto">
            <div className="space-y-2 pr-3">
              {estudiosManual.map((item, i) => (
                <ManualStudyRow
                  key={i}
                  item={item}
                  index={i}
                  plantillas={plantillas}
                  onSelectPlantilla={handleSelectPlantilla}
                  onGenerar={handleGenerarUno}
                  onDownload={handleDownloadUno}
                />
              ))}
            </div>
          </ScrollArea>

          {/* Barra de estado inferior */}
          <div className="flex items-center justify-between pt-1 border-t border-border text-xs text-muted-foreground">
            <span>{conPlantillaCount}/{estudiosManual.length} con plantilla seleccionada</span>
            {listosCount > 0 && (
              <span className="text-primary font-medium">{listosCount} informe{listosCount !== 1 ? 's' : ''} listo{listosCount !== 1 ? 's' : ''} para descargar</span>
            )}
          </div>
        </div>
      )}

      {/* ── Lista de resultados (modo auto) ── */}
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
                      {report.status === 'done' && <CheckCircle2 className="w-5 h-5 text-primary" />}
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

      {/* ── Volver a generar tras completar (modo auto) ── */}
      {step === 'done' && (
        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={() => { setStep('idle'); setReports([]); setEstudiosManual([]); setUnmatchedStudies([]); }}
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
