# Transcriptored — Vercel + Groq Edition

App de transcripción de audios y generación de informes radiológicos.
Versión adaptada para correr en **Vercel** usando **Groq** como motor de IA (gratuito).

## Stack

- **Frontend**: React + TypeScript + Vite + shadcn/ui + Tailwind
- **Backend API**: Vercel Serverless Functions (Node.js) en `/api/`
- **Transcripción de audio**: Groq Whisper (`whisper-large-v3-turbo`)
- **Parsing y edición de texto**: Groq LLM (`llama-3.3-70b-versatile`)
- **Base de datos y almacenamiento**: Supabase (PostgreSQL + Storage)

## Arquitectura

```
Frontend (React/Vite)
    ↓
/api/transcribe          → Groq Whisper API  (transcripción de audio)
/api/parse-transcription → Groq LLM API      (parseo de estudios)
/api/edit-text           → Groq LLM API      (edición inteligente de texto)
    ↓
Supabase (DB + Storage de audios)
```

## Requisitos previos

1. Cuenta en https://console.groq.com — API key gratuita
2. Proyecto en https://supabase.com — con las tablas ya creadas
3. Cuenta en https://vercel.com

## Variables de entorno

Crea `.env.local` en la raíz (o configura en Vercel Dashboard → Settings → Environment Variables):

```
GROQ_API_KEY=gsk_...
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
VITE_SUPABASE_PROJECT_ID=tu-project-id
```

SUPABASE_SERVICE_ROLE_KEY es solo para el backend. Nunca la expongas al frontend.

## Instalación local

```bash
npm install
vercel dev   # Para probar las API Routes localmente
# o:
npm run dev  # Solo el frontend
```

## Deploy en Vercel

Conecta el repo en vercel.com e importa el proyecto.
Agrega todas las variables de entorno en Settings → Environment Variables.

## Modelos de Groq

| Función | Modelo |
|---|---|
| Transcripción | whisper-large-v3-turbo |
| Parseo de estudios | llama-3.3-70b-versatile |
| Edición de texto | llama-3.3-70b-versatile |

## Supabase Storage

Crea el bucket llamado `audios` en tu proyecto Supabase (Storage → New bucket).
Aplica las migraciones de `/supabase/migrations/` desde el Dashboard o con `supabase db push`.
