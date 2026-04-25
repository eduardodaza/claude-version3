/**
 * Vercel API Route: /api/parse-transcription — versión con diagnóstico
 */

module.exports.config = {
  api: { bodyParser: { sizeLimit: '2mb' } },
};

const systemPrompt = `Eres un parser de transcripciones médicas de radiología. Tu tarea es analizar una transcripción dictada y extraer cada estudio individual con su información.

Para cada estudio debes identificar:
1. nombre_paciente: El nombre completo del paciente (se dice al inicio de cada estudio)
2. tipo_estudio: El tipo de estudio (TAC o RM/Resonancia)
3. region: La región anatómica del estudio (ej: abdomen, cráneo, columna lumbar, rodilla, etc.)
4. lateralidad: Si aplica (derecha, izquierda, bilateral), null si no aplica
5. es_contrastado: true si se menciona explícitamente que es contrastado, false si es simple o no se especifica
6. datos_clinicos: ÚNICAMENTE el texto que el médico dicta explícitamente como "indicación", "diagnóstico", "datos clínicos" o "indicaciones clínicas". Solo ese fragmento corto. Si no se dicta ninguna indicación o diagnóstico, devuelve cadena vacía "".
7. conclusiones: ÚNICAMENTE el texto que el médico dicta explícitamente como "conclusiones", "conclusión" o "impresión diagnóstica". Solo ese fragmento específico. Si no se dictan conclusiones explícitamente, devuelve cadena vacía "".
8. hallazgos: ABSOLUTAMENTE TODO el resto del contenido descriptivo de la transcripción que NO sea conclusiones ni indicación/diagnóstico.

Reglas IMPORTANTES:
- REGLA MUSCULOESQUELÉTICO: Si el estudio es TAC de hombro, tobillo, mano, pie, cadera, pierna, brazo o rodilla, usa la plantilla que contenga "musculoesquelético" o "musculoesqueletico".
- REGLA ESTRICTA DE MODALIDAD: Si el estudio es TAC, SOLO usa plantillas con "TAC". Si es RM, SOLO usa plantillas con "RM" o "++RM". NUNCA mezcles modalidades.
- REGLA RM DE HOMBRO: "ruptura parcial" → plantilla con "parcial"; "ruptura completa" → plantilla con "completa"; sin ruptura → plantilla con "tendinosis".
- REGLA TAC ABDOMEN/TÓRAX/TORACOABDOMINAL: Si NO dice "simple" explícitamente → OBLIGATORIAMENTE usa plantilla contrastada.
- Si no hay datos clínicos, hallazgos o conclusiones, devuelve cadena vacía "", NUNCA la palabra "null".
- lateralidad: null si no aplica. NUNCA devuelvas "null" como texto.
- nombre_archivo_sugerido: nombre paciente + plantilla + región + lateralidad (si aplica).`;

const tools = [{
  type: 'function',
  function: {
    name: 'parse_transcription_result',
    description: 'Return the parsed studies from the medical transcription',
    parameters: {
      type: 'object',
      properties: {
        estudios: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              nombre_paciente: { type: 'string' },
              tipo_estudio: { type: 'string' },
              region: { type: 'string' },
              lateralidad: { type: ['string', 'null'] },
              es_contrastado: { type: 'boolean' },
              hallazgos: { type: 'string' },
              conclusiones: { type: 'string' },
              datos_clinicos: { type: 'string' },
              plantilla_match: { type: ['string', 'null'] },
              nombre_archivo_sugerido: { type: 'string' },
            },
            required: ['nombre_paciente','tipo_estudio','region','lateralidad','es_contrastado','hallazgos','conclusiones','datos_clinicos','plantilla_match','nombre_archivo_sugerido'],
            additionalProperties: false,
          },
        },
        estudios_sin_match: { type: 'array', items: { type: 'string' } },
      },
      required: ['estudios', 'estudios_sin_match'],
      additionalProperties: false,
    },
  },
}];

module.exports.default = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const GROQ_API_KEY = process.env.GROQ_API_KEY;

  const diagnostico = {
    has_GROQ_API_KEY: !!GROQ_API_KEY,
    node_version: process.version,
    body_keys: Object.keys(req.body || {}),
    transcriptionText_length: req.body?.transcriptionText?.length || 0,
    templateNames_count: req.body?.templateNames?.length || 0,
  };

  console.log('[parse-transcription] DIAGNÓSTICO:', JSON.stringify(diagnostico));

  if (!GROQ_API_KEY)
    return res.status(500).json({ error: 'GROQ_API_KEY no configurado', diagnostico });

  const { transcriptionText, templateNames } = req.body || {};
  if (!transcriptionText || !templateNames)
    return res.status(400).json({ error: 'Se requiere transcriptionText y templateNames', diagnostico });

  try {
    const fullSystemPrompt = `${systemPrompt}\n\nLista de plantillas disponibles:\n${JSON.stringify(templateNames)}`;

    console.log('[parse-transcription] Llamando a Groq...');

    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: fullSystemPrompt },
          { role: 'user', content: transcriptionText },
        ],
        tools,
        tool_choice: { type: 'function', function: { name: 'parse_transcription_result' } },
        temperature: 0.1,
        max_tokens: 8000,
      }),
    });

    const responseText = await groqResponse.text();
    console.log('[parse-transcription] Groq status:', groqResponse.status);
    console.log('[parse-transcription] Groq response:', responseText.substring(0, 500));

    if (!groqResponse.ok) {
      let errMsg = 'Error al comunicarse con Groq';
      try { errMsg = JSON.parse(responseText).error?.message || errMsg; } catch { errMsg = responseText || errMsg; }
      return res.status(groqResponse.status).json({ error: errMsg, groq_status: groqResponse.status, groq_response: responseText.substring(0, 300), diagnostico });
    }

    const aiData = JSON.parse(responseText);
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      const content = aiData.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || content.match(/(\{[\s\S]*\})/);
      if (!jsonMatch)
        return res.status(500).json({ error: 'No se pudo parsear la respuesta de Groq', raw: content.substring(0, 300), diagnostico });
      return res.status(200).json(JSON.parse(jsonMatch[1] || jsonMatch[0]));
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    console.log(`[parse-transcription] ✅ ${parsed.estudios?.length || 0} estudios`);
    return res.status(200).json(parsed);

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : '';
    console.error('[parse-transcription] EXCEPCIÓN:', msg);
    return res.status(500).json({ error: msg, stack: stack.substring(0, 500), diagnostico });
  }
};
