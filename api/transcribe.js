/**
 * Vercel API Route: /api/transcribe
 * CommonJS — compatible con package.json "type":"module" del frontend.
 * Transcribe audio usando Groq Whisper (whisper-large-v3-turbo).
 * Construye multipart/form-data con Buffers puros de Node.js.
 */

const { createClient } = require('@supabase/supabase-js');

module.exports.config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
};

function buildMultipartBody(fields, files) {
  const boundary = `GroqBoundary${Date.now()}${Math.random().toString(36).slice(2)}`;
  const chunks = [];

  for (const [name, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
    ));
  }

  for (const { name, filename, contentType, data } of files) {
    chunks.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`
    ));
    chunks.push(data);
    chunks.push(Buffer.from('\r\n'));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

module.exports.default = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!GROQ_API_KEY)
    return res.status(500).json({ error: 'GROQ_API_KEY no configurado en Vercel → Settings → Environment Variables' });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)
    return res.status(500).json({ error: 'SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no configurados' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { audioId, storagePath } = req.body;

  if (!audioId || !storagePath)
    return res.status(400).json({ error: 'audioId y storagePath son requeridos' });

  console.log(`[transcribe] audio: ${audioId} | ruta: ${storagePath}`);

  try {
    // 1. Descargar audio desde Supabase Storage
    const { data: audioBlob, error: downloadError } = await supabase.storage
      .from('audios')
      .download(storagePath);

    if (downloadError || !audioBlob) {
      console.error('[transcribe] Error descargando:', downloadError);
      return res.status(500).json({
        error: `Error al descargar el audio: ${downloadError?.message || 'Desconocido'}`,
      });
    }

    console.log(`[transcribe] Descargado: ${audioBlob.size} bytes`);

    // 2. Convertir a Buffer de Node.js
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    // 3. MIME type según extensión
    const fileExt = (storagePath.split('.').pop() || 'mp3').toLowerCase();
    const mimeMap = {
      mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4',
      ogg: 'audio/ogg', webm: 'audio/webm', flac: 'audio/flac',
    };
    const mimeType = mimeMap[fileExt] || 'audio/mpeg';

    // 4. Construir multipart body sin FormData ni dependencias externas
    const { body, contentType } = buildMultipartBody(
      { model: 'whisper-large-v3-turbo', response_format: 'json', language: 'es' },
      [{ name: 'file', filename: `audio.${fileExt}`, contentType: mimeType, data: audioBuffer }]
    );

    console.log(`[transcribe] Enviando ${body.length} bytes a Groq...`);

    // 5. Llamar a Groq Whisper API
    const groqResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': contentType },
      body,
    });

    if (!groqResponse.ok) {
      const errText = await groqResponse.text();
      console.error('[transcribe] Groq error:', groqResponse.status, errText);
      let errMsg = 'Error en la transcripción con Groq';
      try { errMsg = JSON.parse(errText).error?.message || errMsg; } catch { errMsg = errText || errMsg; }
      return res.status(groqResponse.status).json({ error: errMsg });
    }

    const groqResult = await groqResponse.json();
    const textoOriginal = (groqResult.text || '').trim();

    if (!textoOriginal)
      return res.status(500).json({ error: 'Groq no devolvió texto de transcripción' });

    console.log(`[transcribe] Recibido: ${textoOriginal.length} caracteres`);

    // 6. Guardar en Supabase
    const { data: transcripcion, error: insertError } = await supabase
      .from('transcripciones')
      .insert({ audio_id: audioId, texto_original: textoOriginal, texto_editado: textoOriginal })
      .select()
      .single();

    if (insertError) {
      console.error('[transcribe] Error DB:', insertError);
      return res.status(500).json({ error: `Error al guardar: ${insertError.message}` });
    }

    console.log('[transcribe] ✅ Éxito');
    return res.status(200).json({ success: true, transcripcion });

  } catch (error) {
    console.error('[transcribe] Error inesperado:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Error inesperado en el servidor',
    });
  }
};
