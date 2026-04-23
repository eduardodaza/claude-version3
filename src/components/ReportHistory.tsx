import { Download, Trash2, FileText, Calendar, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { InformeWithRelations } from '@/types/database';

interface ReportHistoryProps {
  informes: InformeWithRelations[];
  onDownload: (informe: InformeWithRelations) => Promise<void>;
  onDelete: (informe: InformeWithRelations) => Promise<void>;
  isLoading: boolean;
}

export function ReportHistory({
  informes,
  onDownload,
  onDelete,
  isLoading,
}: ReportHistoryProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-LA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-muted-foreground">Cargando historial...</div>
      </div>
    );
  }

  if (informes.length === 0) {
    return (
      <div className="text-center py-12">
        <FileText className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
        <p className="text-muted-foreground">No hay informes generados aún.</p>
        <p className="text-sm text-muted-foreground">
          Los informes que generes aparecerán aquí.
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[500px] w-full min-w-0">
      <div className="space-y-3 sm:pr-4">
        {informes.map((informe) => (
          <div
            key={informe.id}
            className="border border-border rounded-lg p-4 hover:border-primary/50 transition-colors min-w-0"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between min-w-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 min-w-0">
                  <span className="inline-flex max-w-full items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary truncate">
                    {informe.tipo_informe}
                  </span>
                </div>
                
                <div className="flex items-center gap-2 text-foreground font-medium min-w-0">
                  <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="truncate">{informe.nombre_paciente}</span>
                </div>

                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1 min-w-0">
                  <Calendar className="w-4 h-4 flex-shrink-0" />
                  <span className="break-words">{formatDate(informe.fecha_creacion)}</span>
                </div>

                {informe.plantillas && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1 min-w-0">
                    <FileText className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">Plantilla: {informe.plantillas.nombre}</span>
                  </div>
                )}

                {informe.transcripciones?.audios && (
                  <p className="text-xs text-muted-foreground mt-1 break-words">
                    Audio: {informe.transcripciones.audios.nombre_archivo}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap flex-shrink-0">
                {informe.archivo_word_generado && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onDownload(informe)}
                    className="gap-2 max-w-full"
                  >
                    <Download className="w-4 h-4 shrink-0" />
                    <span className="truncate">Descargar</span>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(informe)}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-border min-w-0">
              <p className="text-sm text-muted-foreground line-clamp-2 break-words">
                {informe.texto_final}
              </p>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
