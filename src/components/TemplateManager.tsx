import { useState, useRef } from 'react';
import { Upload, FileText, X, Trash2, Loader2, Pencil, Check, CheckSquare, Square, Eye } from 'lucide-react';
import { TemplateContentEditor } from '@/components/TemplateContentEditor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { Plantilla } from '@/types/database';

interface TemplateManagerProps {
  plantillas: Plantilla[];
  onUpload: (file: File, nombre: string, descripcion?: string) => Promise<void>;
  onDelete: (plantilla: Plantilla) => Promise<void>;
  onDeleteBulk: (plantillas: Plantilla[]) => Promise<void>;
  onDownload: (plantilla: Plantilla) => Promise<void>;
  onUpdate: (id: string, updates: { nombre?: string; descripcion?: string | null }) => Promise<void>;
  onSelect: (plantilla: Plantilla) => void;
  selectedPlantilla: Plantilla | null;
  isLoading: boolean;
}

interface PendingFile {
  file: File;
  nombre: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  errorMsg?: string;
}

export function TemplateManager({
  plantillas,
  onUpload,
  onDelete,
  onDeleteBulk,
  onDownload,
  onUpdate,
  onSelect,
  selectedPlantilla,
  isLoading,
}: TemplateManagerProps) {
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);
  const [editorPlantilla, setEditorPlantilla] = useState<Plantilla | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const handleFilesSelected = (files: FileList | File[]) => {
    const docxFiles = Array.from(files).filter(
      f => f.name.endsWith('.docx') || f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    if (docxFiles.length === 0) return;
    const newPending: PendingFile[] = docxFiles.map(f => ({
      file: f,
      nombre: f.name.replace(/\.docx$/i, ''),
      status: 'pending' as const,
    }));
    setPendingFiles(prev => [...prev, ...newPending]);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) handleFilesSelected(e.target.files);
    e.target.value = '';
  };

  const readEntriesRecursively = async (entry: FileSystemEntry): Promise<File[]> => {
    if (entry.isFile) {
      return new Promise((resolve) => {
        (entry as FileSystemFileEntry).file((f) => {
          if (f.name.endsWith('.docx')) resolve([f]);
          else resolve([]);
        }, () => resolve([]));
      });
    }
    if (entry.isDirectory) {
      const dirReader = (entry as FileSystemDirectoryEntry).createReader();
      const entries = await new Promise<FileSystemEntry[]>((resolve) => {
        const allEntries: FileSystemEntry[] = [];
        const readBatch = () => {
          dirReader.readEntries((batch) => {
            if (batch.length === 0) { resolve(allEntries); return; }
            allEntries.push(...batch);
            readBatch();
          }, () => resolve(allEntries));
        };
        readBatch();
      });
      const nested = await Promise.all(entries.map(readEntriesRecursively));
      return nested.flat();
    }
    return [];
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const items = e.dataTransfer.items;
    if (items) {
      const entries = Array.from(items)
        .map(item => item.webkitGetAsEntry())
        .filter(Boolean) as FileSystemEntry[];
      const allFiles = await Promise.all(entries.map(readEntriesRecursively));
      handleFilesSelected(allFiles.flat());
    } else if (e.dataTransfer.files) {
      handleFilesSelected(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };

  const removePending = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const updatePendingName = (index: number, nombre: string) => {
    setPendingFiles(prev => prev.map((p, i) => i === index ? { ...p, nombre } : p));
  };

  const handleUploadAll = async () => {
    if (pendingFiles.length === 0) return;
    setIsUploading(true);
    for (let i = 0; i < pendingFiles.length; i++) {
      const pf = pendingFiles[i];
      if (pf.status !== 'pending') continue;
      setPendingFiles(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'uploading' } : p));
      try {
        await onUpload(pf.file, pf.nombre.trim() || pf.file.name.replace(/\.docx$/i, ''));
        setPendingFiles(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'done' } : p));
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Error desconocido';
        setPendingFiles(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'error', errorMsg } : p));
      }
    }
    setIsUploading(false);
    // Keep errors visible, don't auto-close if there were errors
    const hasErrors = pendingFiles.some(p => p.status === 'error');
    if (!hasErrors) {
      setTimeout(() => {
        setPendingFiles([]);
        setIsUploadOpen(false);
      }, 1000);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-LA', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  };

  const filteredPlantillas = plantillas.filter(p =>
    p.nombre.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pendingCount = pendingFiles.filter(p => p.status === 'pending').length;

  const startEdit = (plantilla: Plantilla) => {
    setEditingId(plantilla.id);
    setEditName(plantilla.nombre);
  };

  const saveEdit = async (id: string) => {
    if (editName.trim()) {
      await onUpdate(id, { nombre: editName.trim() });
    }
    setEditingId(null);
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredPlantillas.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredPlantillas.map(p => p.id)));
    }
  };

  const handleDeleteSelected = async () => {
    const toDelete = plantillas.filter(p => selectedIds.has(p.id));
    if (toDelete.length === 0) return;
    setIsDeletingBulk(true);
    try {
      await onDeleteBulk(toDelete);
      setSelectedIds(new Set());
      setSelectionMode(false);
    } finally {
      setIsDeletingBulk(false);
    }
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground">Plantillas Word</h3>
        <div className="flex items-center gap-1">
          {plantillas.length > 0 && (
            <Button
              variant={selectionMode ? 'secondary' : 'ghost'}
              size="sm"
              onClick={selectionMode ? exitSelectionMode : () => setSelectionMode(true)}
              className="gap-1 text-xs"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              {selectionMode ? 'Cancelar' : 'Seleccionar'}
            </Button>
          )}
          <Dialog open={isUploadOpen} onOpenChange={(open) => { setIsUploadOpen(open); if (!open) setPendingFiles([]); }}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Upload className="w-4 h-4" />
                Subir
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Subir Plantillas Word</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div
                  ref={dropRef}
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all border-border hover:border-primary/50"
                >
                  <input ref={fileInputRef} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={handleFileInput} className="hidden" multiple />
                  <input ref={folderInputRef} type="file" // @ts-ignore
                    webkitdirectory="" directory="" onChange={handleFileInput} className="hidden" multiple />
                  <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Arrastra archivos o carpetas aquí</p>
                  <p className="text-xs text-muted-foreground mt-1">Solo archivos .docx</p>
                </div>
                <Button variant="outline" className="w-full gap-2" onClick={(e) => { e.stopPropagation(); folderInputRef.current?.click(); }}>
                  <FileText className="w-4 h-4" /> Seleccionar Carpeta
                </Button>
                {pendingFiles.length > 0 && (
                  <ScrollArea className="max-h-60">
                    <div className="space-y-2">
                      {pendingFiles.map((pf, index) => (
                        <div key={index} className="flex items-center gap-2 p-2 rounded-lg border border-border bg-muted/30">
                          <div className="flex-shrink-0">
                            {pf.status === 'uploading' && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                            {pf.status === 'done' && <span className="text-primary text-sm">✓</span>}
                            {pf.status === 'error' && <span className="text-destructive text-sm" title={pf.errorMsg}>✗</span>}
                            {pf.status === 'pending' && <FileText className="w-4 h-4 text-muted-foreground" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <Input value={pf.nombre} onChange={(e) => updatePendingName(index, e.target.value)} className="h-8 text-sm" disabled={pf.status !== 'pending'} />
                            {pf.status === 'error' && pf.errorMsg && (
                              <p className="text-xs text-destructive mt-1 truncate" title={pf.errorMsg}>{pf.errorMsg}</p>
                            )}
                          </div>
                          {pf.status === 'pending' && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={() => removePending(index)}>
                              <X className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
                {pendingFiles.length > 0 && (
                  <Button onClick={handleUploadAll} disabled={pendingCount === 0 || isUploading} className="w-full gap-2">
                    {isUploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Subiendo...</> : <><Upload className="w-4 h-4" /> Subir {pendingCount} plantilla{pendingCount !== 1 ? 's' : ''}</>}
                  </Button>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Bulk actions bar */}
      {selectionMode && (
        <div className="flex items-center gap-2 p-2 rounded-lg border border-border bg-muted/30">
          <Button variant="ghost" size="sm" onClick={toggleSelectAll} className="gap-1 text-xs">
            {selectedIds.size === filteredPlantillas.length ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
            {selectedIds.size === filteredPlantillas.length ? 'Deseleccionar todo' : 'Seleccionar todo'}
          </Button>
          <span className="text-xs text-muted-foreground flex-1">{selectedIds.size} seleccionada{selectedIds.size !== 1 ? 's' : ''}</span>
          {selectedIds.size > 0 && (
            <Button variant="destructive" size="sm" onClick={handleDeleteSelected} disabled={isDeletingBulk} className="gap-1 text-xs">
              {isDeletingBulk ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Eliminar ({selectedIds.size})
            </Button>
          )}
        </div>
      )}

      {/* Search */}
      {plantillas.length > 5 && (
        <Input placeholder="Buscar plantilla..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="h-9" />
      )}

      {/* Template List */}
      <div className={cn(plantillas.length > 6 ? 'h-[400px]' : '', 'w-full overflow-y-auto overflow-x-auto')} style={{ scrollbarGutter: 'stable' }}>
        <div className="space-y-2 min-w-max pr-2">
          {filteredPlantillas.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8 min-w-0 whitespace-normal">
              {plantillas.length === 0 ? 'No hay plantillas. Sube plantillas Word para comenzar.' : 'No se encontraron plantillas.'}
            </p>
          ) : (
            filteredPlantillas.map((plantilla) => (
              <div
                key={plantilla.id}
                onClick={() => selectionMode ? toggleSelection(plantilla.id) : onSelect(plantilla)}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all whitespace-nowrap',
                  selectedPlantilla?.id === plantilla.id && !selectionMode
                    ? 'border-primary bg-primary/5'
                    : selectedIds.has(plantilla.id)
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50'
                )}
              >
              {selectionMode && (
                  <div className="flex-shrink-0">
                    {selectedIds.has(plantilla.id) ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4 text-muted-foreground" />}
                  </div>
                )}
                {!selectionMode && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setEditorPlantilla(plantilla); }}>
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); startEdit(plantilla); }}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onDelete(plantilla); }}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  {editingId === plantilla.id ? (
                    <div className="flex items-center gap-1">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-7 text-sm"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(plantilla.id); if (e.key === 'Escape') setEditingId(null); }}
                        autoFocus
                      />
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); saveEdit(plantilla.id); }}>
                        <Check className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <p className="font-medium text-foreground">{plantilla.nombre}</p>
                      {plantilla.descripcion && <p className="text-xs text-muted-foreground">{plantilla.descripcion}</p>}
                      <p className="text-xs text-muted-foreground">{formatDate(plantilla.fecha_creacion)}</p>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <TemplateContentEditor
        plantilla={editorPlantilla}
        open={!!editorPlantilla}
        onClose={() => setEditorPlantilla(null)}
      />
    </div>
  );
}
