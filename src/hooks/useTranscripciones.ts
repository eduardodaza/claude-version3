import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Transcripcion, TranscripcionWithAudio } from '@/types/database';

export function useTranscripciones() {
  const [transcripciones, setTranscripciones] = useState<TranscripcionWithAudio[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTranscripciones = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('transcripciones')
        .select(`
          *,
          audios (*)
        `)
        .order('fecha_creacion', { ascending: false });

      if (fetchError) throw fetchError;
      setTranscripciones((data as TranscripcionWithAudio[]) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error fetching transcripciones');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getTranscripcionByAudioId = useCallback(async (audioId: string): Promise<Transcripcion | null> => {
    try {
      const { data, error: fetchError } = await supabase
        .from('transcripciones')
        .select('*')
        .eq('audio_id', audioId)
        .maybeSingle();

      if (fetchError) throw fetchError;
      return data as Transcripcion | null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error fetching transcripcion');
      return null;
    }
  }, []);

  const createTranscripcion = useCallback(async (
    audioId: string,
    textoOriginal: string
  ): Promise<Transcripcion> => {
    setError(null);

    try {
      const { data, error: insertError } = await supabase
        .from('transcripciones')
        .insert({
          audio_id: audioId,
          texto_original: textoOriginal,
          texto_editado: textoOriginal, // Initialize with original
        })
        .select()
        .single();

      if (insertError) throw insertError;

      const newTranscripcion = data as Transcripcion;
      return newTranscripcion;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error creating transcripcion';
      setError(message);
      throw new Error(message);
    }
  }, []);

  const updateTextoEditado = useCallback(async (
    transcripcionId: string,
    textoEditado: string
  ): Promise<void> => {
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from('transcripciones')
        .update({ texto_editado: textoEditado })
        .eq('id', transcripcionId);

      if (updateError) throw updateError;

      setTranscripciones(prev =>
        prev.map(t =>
          t.id === transcripcionId
            ? { ...t, texto_editado: textoEditado, fecha_edicion: new Date().toISOString() }
            : t
        )
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error updating texto_editado';
      setError(message);
      throw new Error(message);
    }
  }, []);

  const deleteAllTranscripciones = useCallback(async () => {
    setError(null);
    try {
      // Delete all associated audios from storage first
      for (const t of transcripciones) {
        if (t.audios?.url_storage) {
          const { error: storageError } = await supabase.storage
            .from('audios')
            .remove([t.audios.url_storage]);
          if (storageError) console.warn('Storage delete error:', storageError);
        }
      }

      // Delete all transcripciones (cascades from audios FK)
      const audioIds = transcripciones.map(t => t.audio_id);
      if (audioIds.length > 0) {
        const { error: delTransError } = await supabase
          .from('transcripciones')
          .delete()
          .in('audio_id', audioIds);
        if (delTransError) throw delTransError;

        const { error: delAudioError } = await supabase
          .from('audios')
          .delete()
          .in('id', audioIds);
        if (delAudioError) throw delAudioError;
      }

      setTranscripciones([]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error deleting all transcripciones';
      setError(message);
      throw new Error(message);
    }
  }, [transcripciones]);

  return {
    transcripciones,
    isLoading,
    error,
    fetchTranscripciones,
    getTranscripcionByAudioId,
    createTranscripcion,
    updateTextoEditado,
    deleteAllTranscripciones,
  };
}
