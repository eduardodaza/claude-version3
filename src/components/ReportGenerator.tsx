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
                  onClick={() => { onSelect(p.id); setOpen(false); setSearch(''); }}
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
  const [estudiosManual, setEstudiosManual] = useState<ParsedStudy[]>([]);
  const [seleccionManual, setSeleccionManual] = useState<Record<number, string>>({});

  const parsearTranscripcion = async (): Promise<ParsedStudy[]> => {
    const templateNames = plantillas.map(p => p.nombre);
    const response = await fetch('/api/parse-transcription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcriptionText: textoFinal, templateNames }),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Error al analizar la transcripción');
    }
    const parsed = await response.json();
    setUnmatchedStudies(parsed.estudios_sin_match || []);
    return parsed.estudios || [];
  };

  const generarDocumentos = async (studies: ParsedStudy[], plantillasPorEstudio?: Record<number, string>) => {
    setStep('generating');

    const initialReports: GeneratedReport[] = studies.map((study, i) => {
      const plantillaId = plantillasPorEstudio?.[i];
      const plantillaSeleccionada = plantillaId ? plantillas.find(p => p.id === plantillaId) : null;
      const plantillaMatchFinal = plantillaSeleccionada ? plantillaSeleccionada.nombre : study.plantilla_match;

      return {
        study: { ...study, plantilla_match: plantillaMatchFinal },
        blob: null,
        fileName: `${study.nombre_archivo_sugerido || study.nombre_paciente}.docx`,
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
