import { useState, useEffect, useCallback } from 'react';
import { ClipboardPaste, FileText, Search } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import type { TranscripcionWithAudio } from '@/types/database';

interface TranscriptionInputProps {
  value: string;
  onChange: (text: string) => void;
}

export function TranscriptionInput({ value, onChange }: TranscriptionInputProps) {
  const [mode, setMode] = useState<string>('paste');
  const [transcripciones, setTranscripciones] = useState<TranscripcionWithAudio[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fetchTranscripciones = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('transcripciones')
        .select(`*, audios (*)`)
        .order('fecha_creacion', { ascending: false });
      if (!error && data) {
        setTranscripciones(data as TranscripcionWithAudio[]);
      }
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mode === 'existing') {
      fetchTranscripciones();
    }
  }, [mode, fetchTranscripciones]);

  const buildCombinedText = (ids: Set<string>) => {
    const selected = transcripciones.filter(t => ids.has(t.id));
    return selected.map(t => t.texto_editado || t.texto_original).join('\n\n');
  };

  const handleToggleTranscripcion = (t: TranscripcionWithAudio) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(t.id)) {
        next.delete(t.id);
      } else {
        next.add(t.id);
      }
      onChange(buildCombinedText(next));
      return next;
    });
  };

  const handleSelectAll = () => {
    const allFilteredIds = filtered.map(t => t.id);
    const allSelected = allFilteredIds.every(id => selectedIds.has(id));
    
    if (allSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        allFilteredIds.forEach(id => next.delete(id));
        onChange(buildCombinedText(next));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        allFilteredIds.forEach(id => next.add(id));
        onChange(buildCombinedText(next));
        return next;
      });
    }
  };

  const filtered = transcripciones.filter(t => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const name = t.audios?.nombre_archivo?.toLowerCase() || '';
    const text = (t.texto_editado || t.texto_original).toLowerCase();
    return name.includes(q) || text.includes(q);
  });

  const allFilteredSelected = filtered.length > 0 && filtered.every(t => selectedIds.has(t.id));

  return (
    <div className="space-y-3">
      <Label>Transcripción para el informe</Label>
      <Tabs value={mode} onValueChange={(v) => { setMode(v); setSelectedIds(new Set()); }}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="paste" className="gap-2 text-xs sm:text-sm">
            <ClipboardPaste className="w-4 h-4" />
            Pegar texto
          </TabsTrigger>
          <TabsTrigger value="existing" className="gap-2 text-xs sm:text-sm">
            <FileText className="w-4 h-4" />
            Usar transcripción existente
          </TabsTrigger>
        </TabsList>

        <TabsContent value="paste" className="mt-3">
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Pega aquí la transcripción que deseas usar para generar el informe..."
            className="min-h-[200px] text-sm"
          />
        </TabsContent>

        <TabsContent value="existing" className="mt-3 space-y-3">
          {transcripciones.length > 5 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre de audio o contenido..."
                className="pl-9"
              />
            </div>
          )}

          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Cargando transcripciones...</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {transcripciones.length === 0
                ? 'No hay transcripciones aún. Transcribe un audio primero en la pestaña "Transcribir".'
                : 'No se encontraron resultados.'}
            </p>
          ) : (
            <>
              {filtered.length > 1 && (
                <div className="flex items-center gap-2 px-1">
                  <Checkbox
                    checked={allFilteredSelected}
                    onCheckedChange={handleSelectAll}
                    id="select-all"
                  />
                  <label htmlFor="select-all" className="text-xs text-muted-foreground cursor-pointer">
                    Seleccionar todas ({filtered.length})
                  </label>
                  {selectedIds.size > 0 && (
                    <span className="text-xs text-primary ml-auto">{selectedIds.size} seleccionada{selectedIds.size !== 1 ? 's' : ''}</span>
                  )}
                </div>
              )}
              <ScrollArea className="h-[250px]">
                <div className="space-y-2 pr-3">
                  {filtered.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => handleToggleTranscripcion(t)}
                      className={cn(
                        'w-full text-left p-3 rounded-lg border transition-colors flex gap-3 items-start',
                        selectedIds.has(t.id)
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50 hover:bg-muted/50'
                      )}
                    >
                      <Checkbox
                        checked={selectedIds.has(t.id)}
                        className="mt-0.5 pointer-events-none"
                        tabIndex={-1}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {t.audios?.nombre_archivo || 'Audio sin nombre'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(t.fecha_creacion).toLocaleDateString('es-LA', {
                            day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                          })}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {(t.texto_editado || t.texto_original).substring(0, 150)}...
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </>
          )}

          {selectedIds.size > 0 && (
            <div className="border border-border rounded-lg">
              <ScrollArea className="h-[150px]">
                <div className="p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Contenido combinado ({selectedIds.size} transcripción{selectedIds.size !== 1 ? 'es' : ''}):
                  </p>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{value}</p>
                </div>
              </ScrollArea>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
