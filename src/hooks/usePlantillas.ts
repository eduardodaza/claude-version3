import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { uploadTemplateToStorage, deleteFile, downloadFile } from '@/lib/storage';
import type { Plantilla } from '@/types/database';

export function usePlantillas() {
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPlantillas = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('plantillas')
        .select('*')
        .order('fecha_creacion', { ascending: false });

      if (fetchError) throw fetchError;
      setPlantillas((data as Plantilla[]) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error fetching plantillas');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const uploadPlantilla = useCallback(async (
    file: File,
    nombre: string,
    descripcion?: string
  ): Promise<Plantilla> => {
    setError(null);

    try {
      // Upload to storage
      const storagePath = await uploadTemplateToStorage(file);

      // Create database record
      const { data, error: insertError } = await supabase
        .from('plantillas')
        .insert({
          nombre,
          descripcion: descripcion || null,
          archivo_word: storagePath,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      const newPlantilla = data as Plantilla;
      setPlantillas(prev => [newPlantilla, ...prev]);
      return newPlantilla;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error uploading plantilla';
      setError(message);
      throw new Error(message);
    }
  }, []);

  const deletePlantilla = useCallback(async (plantilla: Plantilla) => {
    setError(null);

    try {
      // Delete from storage
      await deleteFile('plantillas', plantilla.archivo_word);

      // Delete from database
      const { error: deleteError } = await supabase
        .from('plantillas')
        .delete()
        .eq('id', plantilla.id);

      if (deleteError) throw deleteError;

      setPlantillas(prev => prev.filter(p => p.id !== plantilla.id));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error deleting plantilla';
      setError(message);
      throw new Error(message);
    }
  }, []);

  const updatePlantilla = useCallback(async (
    id: string,
    updates: { nombre?: string; descripcion?: string | null }
  ): Promise<void> => {
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from('plantillas')
        .update({ ...updates, fecha_edicion: new Date().toISOString() })
        .eq('id', id);

      if (updateError) throw updateError;

      setPlantillas(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error updating plantilla';
      setError(message);
      throw new Error(message);
    }
  }, []);

  const deletePlantillasBulk = useCallback(async (items: Plantilla[]) => {
    setError(null);
    try {
      for (const plantilla of items) {
        await deleteFile('plantillas', plantilla.archivo_word);
        const { error: deleteError } = await supabase
          .from('plantillas')
          .delete()
          .eq('id', plantilla.id);
        if (deleteError) throw deleteError;
      }
      const ids = new Set(items.map(p => p.id));
      setPlantillas(prev => prev.filter(p => !ids.has(p.id)));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error deleting plantillas';
      setError(message);
      throw new Error(message);
    }
  }, []);

  const downloadPlantilla = useCallback(async (plantilla: Plantilla): Promise<Blob> => {
    try {
      return await downloadFile('plantillas', plantilla.archivo_word);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error downloading plantilla';
      setError(message);
      throw new Error(message);
    }
  }, []);

  return {
    plantillas,
    isLoading,
    error,
    fetchPlantillas,
    uploadPlantilla,
    deletePlantilla,
    deletePlantillasBulk,
    updatePlantilla,
    downloadPlantilla,
  };
}
