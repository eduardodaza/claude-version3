import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { uploadReportToStorage, downloadFile, deleteFile } from '@/lib/storage';
import type { Informe, InformeWithRelations } from '@/types/database';

export function useInformes() {
  const [informes, setInformes] = useState<InformeWithRelations[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInformes = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('informes')
        .select(`
          *,
          plantillas (*),
          transcripciones (
            *,
            audios (*)
          )
        `)
        .order('fecha_creacion', { ascending: false });

      if (fetchError) throw fetchError;
      setInformes((data as InformeWithRelations[]) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error fetching informes');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createInforme = useCallback(async (
    nombrePaciente: string,
    tipoInforme: string,
    textoFinal: string,
    plantillaId: string | null,
    transcripcionId: string | null,
    docxBlob?: Blob
  ): Promise<Informe> => {
    setError(null);

    try {
      let archivoWordGenerado: string | null = null;

      if (docxBlob) {
        const fileName = `${nombrePaciente.replace(/\s+/g, '_')}_${tipoInforme.replace(/\s+/g, '_')}.docx`;
        archivoWordGenerado = await uploadReportToStorage(docxBlob, fileName);
      }

      const { data, error: insertError } = await supabase
        .from('informes')
        .insert({
          nombre_paciente: nombrePaciente,
          tipo_informe: tipoInforme,
          texto_final: textoFinal,
          plantilla_id: plantillaId,
          transcripcion_id: transcripcionId,
          archivo_word_generado: archivoWordGenerado,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      const newInforme = data as Informe;
      return newInforme;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error creating informe';
      setError(message);
      throw new Error(message);
    }
  }, []);

  const deleteInforme = useCallback(async (informe: Informe) => {
    setError(null);

    try {
      // Delete generated file from storage if exists
      if (informe.archivo_word_generado) {
        await deleteFile('informes', informe.archivo_word_generado);
      }

      // Delete from database
      const { error: deleteError } = await supabase
        .from('informes')
        .delete()
        .eq('id', informe.id);

      if (deleteError) throw deleteError;

      setInformes(prev => prev.filter(i => i.id !== informe.id));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error deleting informe';
      setError(message);
      throw new Error(message);
    }
  }, []);

  const downloadInforme = useCallback(async (informe: Informe): Promise<Blob | null> => {
    if (!informe.archivo_word_generado) return null;

    try {
      return await downloadFile('informes', informe.archivo_word_generado);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error downloading informe';
      setError(message);
      throw new Error(message);
    }
  }, []);

  return {
    informes,
    isLoading,
    error,
    fetchInformes,
    createInforme,
    deleteInforme,
    downloadInforme,
  };
}
