import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { uploadAudioToStorage, deleteFile } from '@/lib/storage';
import type { Audio } from '@/types/database';

export function useAudios() {
  const [audios, setAudios] = useState<Audio[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAudios = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('audios')
        .select('*')
        .order('fecha_subida', { ascending: false });

      if (fetchError) throw fetchError;
      setAudios((data as Audio[]) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error fetching audios');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const uploadAudio = useCallback(async (file: File): Promise<Audio> => {
    setError(null);

    try {
      // Upload to storage
      const storagePath = await uploadAudioToStorage(file);

      // Create database record
      const { data, error: insertError } = await supabase
        .from('audios')
        .insert({
          nombre_archivo: file.name,
          url_storage: storagePath,
          tamano_bytes: file.size,
          tipo_mime: file.type,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      const newAudio = data as Audio;
      setAudios(prev => [newAudio, ...prev]);
      return newAudio;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error uploading audio';
      setError(message);
      throw new Error(message);
    }
  }, []);

  const deleteAudio = useCallback(async (audio: Audio) => {
    setError(null);

    try {
      // Delete from storage
      await deleteFile('audios', audio.url_storage);

      // Delete from database (cascade will delete transcriptions)
      const { error: deleteError } = await supabase
        .from('audios')
        .delete()
        .eq('id', audio.id);

      if (deleteError) throw deleteError;

      setAudios(prev => prev.filter(a => a.id !== audio.id));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error deleting audio';
      setError(message);
      throw new Error(message);
    }
  }, []);

  return {
    audios,
    isLoading,
    error,
    fetchAudios,
    uploadAudio,
    deleteAudio,
  };
}
