import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { downloadFile } from '@/lib/storage';
import { supabase } from '@/integrations/supabase/client';
import { extractDocxParagraphs, applyDocxEdits, type DocxParagraph, type ParagraphStyle } from '@/lib/docxTextEditor';
import type { Plantilla } from '@/types/database';
import type JSZip from 'jszip';

interface TemplateContentEditorProps {
  plantilla: Plantilla | null;
  open: boolean;
  onClose: () => void;
}

function getStyleForParagraph(style: ParagraphStyle): React.CSSProperties {
  const css: React.CSSProperties = {};

  if (style.fontFamily) css.fontFamily = `"${style.fontFamily}", serif`;
  
  if (style.fontSize) {
    css.fontSize = `${style.fontSize}pt`;
  } else if (style.isHeader) {
    const sizes: Record<number, number> = { 1: 20, 2: 16, 3: 14 };
    css.fontSize = `${sizes[style.headingLevel || 1] || 16}pt`;
  }

  if (style.color) css.color = style.color;
  if (style.bold || style.isHeader) css.fontWeight = 'bold';
  if (style.italic) css.fontStyle = 'italic';
  if (style.underline) css.textDecoration = 'underline';

  if (style.alignment) css.textAlign = style.alignment;

  if (style.spacingBefore != null) css.paddingTop = `${style.spacingBefore}pt`;
  if (style.spacingAfter != null) css.paddingBottom = `${style.spacingAfter}pt`;

  if (style.lineSpacing) css.lineHeight = `${style.lineSpacing}`;

  return css;
}

export function TemplateContentEditor({ plantilla, open, onClose }: TemplateContentEditorProps) {
  const [paragraphs, setParagraphs] = useState<DocxParagraph[]>([]);
  const [editedTexts, setEditedTexts] = useState<Map<number, string>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [zipRef, setZipRef] = useState<JSZip | null>(null);
  const [docXmlRef, setDocXmlRef] = useState<string>('');
  const editableRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const loadTemplate = useCallback(async () => {
    if (!plantilla) return;
    setIsLoading(true);
    setParagraphs([]);
    setEditedTexts(new Map());

    try {
      const blob = await downloadFile('plantillas', plantilla.archivo_word);
      const { paragraphs: extracted, zip, docXml } = await extractDocxParagraphs(blob);
      setParagraphs(extracted);
      setZipRef(zip);
      setDocXmlRef(docXml);
    } catch (err) {
      toast.error('Error al abrir la plantilla: ' + (err instanceof Error ? err.message : 'Error desconocido'));
      onClose();
    } finally {
      setIsLoading(false);
    }
  }, [plantilla, onClose]);

  useEffect(() => {
    if (open && plantilla) {
      loadTemplate();
    }
  }, [open, plantilla, loadTemplate]);

  const handleInput = (paragraphIndex: number, el: HTMLDivElement) => {
    const newText = el.innerText;
    setEditedTexts(prev => {
      const next = new Map(prev);
      const original = paragraphs.find(p => p.index === paragraphIndex);
      if (original && original.text === newText) {
        next.delete(paragraphIndex);
      } else {
        next.set(paragraphIndex, newText);
      }
      return next;
    });
  };

  const hasChanges = editedTexts.size > 0;

  const handleSave = async () => {
    if (!plantilla || !zipRef || !hasChanges) return;
    setIsSaving(true);

    try {
      const newBlob = await applyDocxEdits(zipRef, docXmlRef, editedTexts);

      const { error: uploadError } = await supabase.storage
        .from('plantillas')
        .update(plantilla.archivo_word, newBlob, {
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      await supabase
        .from('plantillas')
        .update({ fecha_edicion: new Date().toISOString() })
        .eq('id', plantilla.id);

      toast.success('Plantilla guardada correctamente');
      onClose();
    } catch (err) {
      toast.error('Error al guardar: ' + (err instanceof Error ? err.message : 'Error desconocido'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between pr-8">
            <span className="truncate">Editar: {plantilla?.nombre}</span>
            <div className="flex items-center gap-2 flex-shrink-0">
              {hasChanges && (
                <Button size="sm" onClick={handleSave} disabled={isSaving} className="gap-1">
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Guardar
                </Button>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Cargando contenido...</span>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto max-h-[70vh]">
            {/* Word-like page container */}
            <div
              className="mx-auto bg-white shadow-md border border-border"
              style={{
                maxWidth: '210mm',
                minHeight: '297mm',
                padding: '2.54cm',
                fontFamily: '"Calibri", "Times New Roman", serif',
                fontSize: '11pt',
                lineHeight: '1.15',
                color: '#000000',
              }}
            >
              {paragraphs.map((para) => {
                const isModified = editedTexts.has(para.index);
                const inlineStyle = getStyleForParagraph(para.style);

                // Empty paragraphs render as spacing
                if (para.text.trim().length === 0) {
                  return (
                    <div
                      key={para.index}
                      style={{
                        ...inlineStyle,
                        minHeight: `${para.style.fontSize || 11}pt`,
                      }}
                    >
                      &nbsp;
                    </div>
                  );
                }

                return (
                  <div
                    key={para.index}
                    ref={(el) => {
                      if (el) editableRefs.current.set(para.index, el);
                    }}
                    contentEditable
                    suppressContentEditableWarning
                    onInput={(e) => handleInput(para.index, e.currentTarget as HTMLDivElement)}
                    style={{
                      ...inlineStyle,
                      outline: 'none',
                      borderLeft: isModified ? '3px solid hsl(var(--primary))' : '3px solid transparent',
                      paddingLeft: '8px',
                      marginLeft: '-11px',
                      transition: 'border-color 0.2s',
                    }}
                  >
                    {para.text}
                  </div>
                );
              })}
              {paragraphs.length === 0 && !isLoading && (
                <p className="text-center text-muted-foreground py-8">
                  No se encontró contenido de texto en esta plantilla.
                </p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
