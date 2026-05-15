-- Fix: Update audios bucket to allow 100MB files
UPDATE storage.buckets SET file_size_limit = 104857600 WHERE id = 'audios';

-- Create quick_actions table for permanent persistence
CREATE TABLE IF NOT EXISTS public.quick_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  label TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Disable RLS since app has no auth
ALTER TABLE public.quick_actions ENABLE ROW LEVEL SECURITY;

-- Allow full public access (no auth in this app)
CREATE POLICY "Allow all access to quick_actions"
  ON public.quick_actions
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Insert default actions
INSERT INTO public.quick_actions (label, position) VALUES
  ('Corrige la ortografía y puntuación', 0),
  ('Organiza el texto en párrafos', 1),
  ('Elimina muletillas y repeticiones', 2),
  ('Mejora la claridad del texto', 3);