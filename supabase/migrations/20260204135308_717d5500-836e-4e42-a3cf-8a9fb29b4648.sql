-- =============================================
-- AUDIO TRANSCRIPTION APP - COMPLETE SCHEMA
-- =============================================

-- Create storage buckets for files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('audios', 'audios', false, 26214400, ARRAY['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/m4a', 'audio/ogg', 'audio/webm', 'audio/x-m4a']),
  ('plantillas', 'plantillas', false, 10485760, ARRAY['application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('informes', 'informes', false, 10485760, ARRAY['application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
ON CONFLICT (id) DO NOTHING;

-- Public access policies for storage (no auth required as per PRD)
CREATE POLICY "Public can upload audios"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'audios');

CREATE POLICY "Public can read audios"
ON storage.objects FOR SELECT
USING (bucket_id = 'audios');

CREATE POLICY "Public can delete audios"
ON storage.objects FOR DELETE
USING (bucket_id = 'audios');

CREATE POLICY "Public can upload plantillas"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'plantillas');

CREATE POLICY "Public can read plantillas"
ON storage.objects FOR SELECT
USING (bucket_id = 'plantillas');

CREATE POLICY "Public can delete plantillas"
ON storage.objects FOR DELETE
USING (bucket_id = 'plantillas');

CREATE POLICY "Public can upload informes"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'informes');

CREATE POLICY "Public can read informes"
ON storage.objects FOR SELECT
USING (bucket_id = 'informes');

-- =============================================
-- TABLE: audios
-- =============================================
CREATE TABLE public.audios (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre_archivo TEXT NOT NULL,
  duracion INTEGER, -- duration in seconds (optional, can be null if unknown)
  fecha_subida TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  url_storage TEXT NOT NULL,
  tamano_bytes BIGINT NOT NULL,
  tipo_mime TEXT NOT NULL
);

-- Enable RLS
ALTER TABLE public.audios ENABLE ROW LEVEL SECURITY;

-- Public access policies (no auth required)
CREATE POLICY "Public can view audios"
ON public.audios FOR SELECT
USING (true);

CREATE POLICY "Public can insert audios"
ON public.audios FOR INSERT
WITH CHECK (true);

CREATE POLICY "Public can delete audios"
ON public.audios FOR DELETE
USING (true);

-- =============================================
-- TABLE: transcripciones
-- texto_original: IMMUTABLE - only written by ASR
-- texto_editado: MUTABLE - can be modified by LLM
-- =============================================
CREATE TABLE public.transcripciones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  audio_id UUID NOT NULL REFERENCES public.audios(id) ON DELETE CASCADE,
  texto_original TEXT NOT NULL, -- IMMUTABLE: only ASR can write this
  texto_editado TEXT, -- MUTABLE: user/LLM can modify this
  fecha_creacion TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  fecha_edicion TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.transcripciones ENABLE ROW LEVEL SECURITY;

-- Public access policies
CREATE POLICY "Public can view transcripciones"
ON public.transcripciones FOR SELECT
USING (true);

CREATE POLICY "Public can insert transcripciones"
ON public.transcripciones FOR INSERT
WITH CHECK (true);

CREATE POLICY "Public can update transcripciones"
ON public.transcripciones FOR UPDATE
USING (true);

CREATE POLICY "Public can delete transcripciones"
ON public.transcripciones FOR DELETE
USING (true);

-- =============================================
-- TABLE: plantillas
-- =============================================
CREATE TABLE public.plantillas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  archivo_word TEXT NOT NULL, -- storage path
  fecha_creacion TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  fecha_edicion TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.plantillas ENABLE ROW LEVEL SECURITY;

-- Public access policies
CREATE POLICY "Public can view plantillas"
ON public.plantillas FOR SELECT
USING (true);

CREATE POLICY "Public can insert plantillas"
ON public.plantillas FOR INSERT
WITH CHECK (true);

CREATE POLICY "Public can update plantillas"
ON public.plantillas FOR UPDATE
USING (true);

CREATE POLICY "Public can delete plantillas"
ON public.plantillas FOR DELETE
USING (true);

-- =============================================
-- TABLE: informes
-- =============================================
CREATE TABLE public.informes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre_paciente TEXT NOT NULL,
  tipo_informe TEXT NOT NULL,
  texto_final TEXT NOT NULL,
  plantilla_id UUID REFERENCES public.plantillas(id) ON DELETE SET NULL,
  transcripcion_id UUID REFERENCES public.transcripciones(id) ON DELETE SET NULL,
  fecha_creacion TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  archivo_word_generado TEXT -- storage path to generated .docx
);

-- Enable RLS
ALTER TABLE public.informes ENABLE ROW LEVEL SECURITY;

-- Public access policies
CREATE POLICY "Public can view informes"
ON public.informes FOR SELECT
USING (true);

CREATE POLICY "Public can insert informes"
ON public.informes FOR INSERT
WITH CHECK (true);

CREATE POLICY "Public can update informes"
ON public.informes FOR UPDATE
USING (true);

CREATE POLICY "Public can delete informes"
ON public.informes FOR DELETE
USING (true);

-- =============================================
-- TRIGGER: Protect texto_original from updates
-- This ensures ASR output is NEVER modified
-- =============================================
CREATE OR REPLACE FUNCTION public.protect_texto_original()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.texto_original IS DISTINCT FROM NEW.texto_original THEN
    RAISE EXCEPTION 'texto_original is immutable and cannot be modified';
  END IF;
  NEW.fecha_edicion = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER protect_texto_original_trigger
BEFORE UPDATE ON public.transcripciones
FOR EACH ROW
EXECUTE FUNCTION public.protect_texto_original();

-- =============================================
-- INDEXES for better performance
-- =============================================
CREATE INDEX idx_transcripciones_audio_id ON public.transcripciones(audio_id);
CREATE INDEX idx_informes_plantilla_id ON public.informes(plantilla_id);
CREATE INDEX idx_informes_transcripcion_id ON public.informes(transcripcion_id);
CREATE INDEX idx_informes_fecha_creacion ON public.informes(fecha_creacion DESC);