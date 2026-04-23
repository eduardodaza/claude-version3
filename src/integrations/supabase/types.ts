export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      audios: {
        Row: {
          duracion: number | null
          fecha_subida: string
          id: string
          nombre_archivo: string
          tamano_bytes: number
          tipo_mime: string
          url_storage: string
        }
        Insert: {
          duracion?: number | null
          fecha_subida?: string
          id?: string
          nombre_archivo: string
          tamano_bytes: number
          tipo_mime: string
          url_storage: string
        }
        Update: {
          duracion?: number | null
          fecha_subida?: string
          id?: string
          nombre_archivo?: string
          tamano_bytes?: number
          tipo_mime?: string
          url_storage?: string
        }
        Relationships: []
      }
      informes: {
        Row: {
          archivo_word_generado: string | null
          fecha_creacion: string
          id: string
          nombre_paciente: string
          plantilla_id: string | null
          texto_final: string
          tipo_informe: string
          transcripcion_id: string | null
        }
        Insert: {
          archivo_word_generado?: string | null
          fecha_creacion?: string
          id?: string
          nombre_paciente: string
          plantilla_id?: string | null
          texto_final: string
          tipo_informe: string
          transcripcion_id?: string | null
        }
        Update: {
          archivo_word_generado?: string | null
          fecha_creacion?: string
          id?: string
          nombre_paciente?: string
          plantilla_id?: string | null
          texto_final?: string
          tipo_informe?: string
          transcripcion_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "informes_plantilla_id_fkey"
            columns: ["plantilla_id"]
            isOneToOne: false
            referencedRelation: "plantillas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "informes_transcripcion_id_fkey"
            columns: ["transcripcion_id"]
            isOneToOne: false
            referencedRelation: "transcripciones"
            referencedColumns: ["id"]
          },
        ]
      }
      plantillas: {
        Row: {
          archivo_word: string
          descripcion: string | null
          fecha_creacion: string
          fecha_edicion: string | null
          id: string
          nombre: string
        }
        Insert: {
          archivo_word: string
          descripcion?: string | null
          fecha_creacion?: string
          fecha_edicion?: string | null
          id?: string
          nombre: string
        }
        Update: {
          archivo_word?: string
          descripcion?: string | null
          fecha_creacion?: string
          fecha_edicion?: string | null
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      quick_actions: {
        Row: {
          created_at: string
          id: string
          label: string
          position: number
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          position?: number
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          position?: number
        }
        Relationships: []
      }
      transcripciones: {
        Row: {
          audio_id: string
          fecha_creacion: string
          fecha_edicion: string | null
          id: string
          texto_editado: string | null
          texto_original: string
        }
        Insert: {
          audio_id: string
          fecha_creacion?: string
          fecha_edicion?: string | null
          id?: string
          texto_editado?: string | null
          texto_original: string
        }
        Update: {
          audio_id?: string
          fecha_creacion?: string
          fecha_edicion?: string | null
          id?: string
          texto_editado?: string | null
          texto_original?: string
        }
        Relationships: [
          {
            foreignKeyName: "transcripciones_audio_id_fkey"
            columns: ["audio_id"]
            isOneToOne: false
            referencedRelation: "audios"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
