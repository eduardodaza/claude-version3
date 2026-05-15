// Database types for the transcription app

export interface Audio {
  id: string;
  nombre_archivo: string;
  duracion: number | null;
  fecha_subida: string;
  url_storage: string;
  tamano_bytes: number;
  tipo_mime: string;
}

export interface Transcripcion {
  id: string;
  audio_id: string;
  texto_original: string; // IMMUTABLE - only written by ASR
  texto_editado: string | null; // MUTABLE - can be modified by LLM
  fecha_creacion: string;
  fecha_edicion: string | null;
}

export interface Plantilla {
  id: string;
  nombre: string;
  descripcion: string | null;
  archivo_word: string;
  fecha_creacion: string;
  fecha_edicion: string | null;
}

export interface Informe {
  id: string;
  nombre_paciente: string;
  tipo_informe: string;
  texto_final: string;
  plantilla_id: string | null;
  transcripcion_id: string | null;
  fecha_creacion: string;
  archivo_word_generado: string | null;
}

// Extended types with relations
export interface TranscripcionWithAudio extends Transcripcion {
  audios?: Audio;
}

export interface InformeWithRelations extends Informe {
  plantillas?: Plantilla;
  transcripciones?: TranscripcionWithAudio;
}
