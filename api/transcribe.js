/**
 * Vercel API Route: /api/transcribe — versión con diagnóstico detallado
 */

let createClient;
try {
  createClient = require('@supabase/supabase-js').createClient;
} catch(e) {
  // Si falla el require, lo reportamos en el handler
}

module.exports.config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
};

function buildMultipartBody(fields, files) {
  const boundary = `GroqBoundary${Date.now()}${Math.random().toString(36).slice(2)}`;
  const chunks = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  for (const { name, filename, contentType, data } of files) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`));
    chunks.push(data);
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

module.exports.default = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── DIAGNÓSTICO: reportar estado de variables y dependencias ──
  const diagnostico = {
    has_GROQ_API_KEY: !!process.env.GROQ_API_KEY,
    has_SUPABASE_URL: !!(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL),
    has_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    supabase_loaded: !!createClient,
    node_version: process.version,
    body_keys: Object.keys(req.body || {}),
  };
  console.log('[transcribe] DIAGNÓSTICO:', JSON.stringify(diagnostico));

  if (!createClient) {
    return res.status(500).json({ error: 'No se pudo cargar @supabase/supabase-js', diagnostico });
  }

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!GROQ_API_KEY)
    return res.status(500).json({ error: 'GROQ_API_KEY no configurado', diagnostico });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)
    return res.status(500).json({ error: 'Credenciales Supabase no configuradas', diagnostico });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { audioId, storagePath } = req.body || {};

  if (!audioId || !storagePath)
    return res.status(400).json({ error: 'audioId y storagePath son requeridos', diagnostico });

  console.log(`[transcribe] audio: ${audioId} | ruta: ${storagePath}`);

  try {
    const { data: audioBlob, error: downloadError } = await supabase.storage
      .from('audios')
      .download(storagePath);

    if (downloadError || !audioBlob) {
      return res.status(500).json({
        error: `Error al descargar el audio: ${downloadError?.message || 'Desconocido'}`,
        diagnostico,
      });
    }

    console.log(`[transcribe] Descargado: ${audioBlob.size} bytes`);

    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);
    const fileExt = (storagePath.split('.').pop() || 'mp3').toLowerCase();
    const mimeMap = { mp3:'audio/mpeg', wav:'audio/wav', m4a:'audio/mp4', ogg:'audio/ogg', webm:'audio/webm', flac:'audio/flac' };
    const mimeType = mimeMap[fileExt] || 'audio/mpeg';

    // PROMPT corto y preciso: un prompt largo compite con el audio y causa truncado.
    // La instrucción de medidas evita que Whisper corte decimales en pausas cortas.
    const whisperPrompt = 'Informe radiológico médico en español. Medidas siempre completas con decimales, por ejemplo: 4.5 cm, 12.3 mm. Términos: TAC, RM, resonancia magnética, tomografía, parénquima, hepático, esplénico, adenopatía, nódulo, lesión, derrame, pleural, mediastino, retroperitoneo, manguito rotador, menisco, ligamento, disco intervertebral, estenosis, trombosis, contraste, STENT, colecistectomia, bronquiectasias, centrilobulillar.';

    const { body, contentType } = buildMultipartBody(
      {
        model: 'whisper-large-v3',
        response_format: 'verbose_json',
        language: 'es',
        prompt: whisperPrompt,
      },
      [{ name: 'file', filename: `audio.${fileExt}`, contentType: mimeType, data: audioBuffer }]
    );

    console.log(`[transcribe] Enviando ${body.length} bytes a Groq (verbose_json)...`);

    const groqResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': contentType },
      body,
    });

    if (!groqResponse.ok) {
      const errText = await groqResponse.text();
      console.error('[transcribe] Groq error:', groqResponse.status, errText);
      let errMsg = 'Error en Groq';
      try { errMsg = JSON.parse(errText).error?.message || errMsg; } catch { errMsg = errText || errMsg; }
      return res.status(groqResponse.status).json({ error: errMsg, diagnostico });
    }

    const groqResult = await groqResponse.json();

    // Reconstruir texto completo desde TODOS los segmentos para evitar truncado silencioso.
    // Si verbose_json devuelve segments, concatenarlos; si no, usar .text como fallback.
    let textoOriginal = '';
    if (groqResult.segments && groqResult.segments.length > 0) {
      textoOriginal = groqResult.segments.map(s => (s.text || '').trim()).filter(Boolean).join(' ').trim();
      console.log(`[transcribe] Segmentos: ${groqResult.segments.length} | Chars: ${textoOriginal.length}`);
    } else {
      textoOriginal = (groqResult.text || '').trim();
      console.log(`[transcribe] Sin segmentos, usando .text | Chars: ${textoOriginal.length}`);
    }

    if (!textoOriginal)
      return res.status(500).json({ error: 'Groq no devolvió texto', diagnostico });

    console.log(`[transcribe] Recibido: ${textoOriginal.length} chars`);

    const { data: transcripcion, error: insertError } = await supabase
      .from('transcripciones')
      .insert({ audio_id: audioId, texto_original: textoOriginal, texto_editado: textoOriginal })
      .select()
      .single();

    if (insertError)
      return res.status(500).json({ error: `Error al guardar: ${insertError.message}`, diagnostico });

    console.log('[transcribe] ✅ Éxito');
    return res.status(200).json({ success: true, transcripcion });

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : '';
    console.error('[transcribe] EXCEPCIÓN:', msg, stack);
    return res.status(500).json({ error: msg, stack, diagnostico });
  }
};
