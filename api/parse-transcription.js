module.exports.config = {
  api: { bodyParser: { sizeLimit: '2mb' } },
};

const systemPromptManual = `Eres un parser de transcripciones médicas. Extrae TODOS los estudios del texto y devuelve JSON via tool call.

Por cada estudio identifica:
- nombre_paciente: nombre completo
- tipo_estudio: TAC o RM
- region: región anatómica
- lateralidad: "derecha"/"izquierda"/"bilateral" o null
- es_contrastado: true/false
- datos_clinicos: texto de "indicación"/"diagnóstico"/"datos clínicos", o ""
- conclusiones: texto de "conclusiones"/"conclusión"/"impresión diagnóstica", o ""
- hallazgos: Copia TEXTUALMENTE y de forma COMPLETA absolutamente todo el texto dictado que no sea conclusiones ni datos_clinicos. No resumas, no omitas, no parafrasees ninguna palabra. El campo hallazgos debe ser una copia fiel y completa del dictado original.
- plantilla_match: null (el usuario la seleccionará manualmente)
- nombre_archivo_sugerido: nombre_paciente + tipo_estudio + region. NO repitas la lateralidad si ya está incluida en la región.

IMPORTANTE: Extrae ABSOLUTAMENTE TODOS los estudios del texto sin excepción.
REGLA ESTUDIOS BILATERALES: Si el médico dicta el mismo tipo de estudio para lado derecho e izquierdo por separado, crea DOS estudios separados, uno por cada lado. Nunca los fusiones en uno solo.
REGLA CONTENIDO COMPLETO: Es absolutamente prohibido omitir, resumir o parafrasear cualquier parte del dictado. Todo el texto original debe aparecer distribuido entre hallazgos, conclusiones y datos_clinicos sin que se pierda ni una sola palabra.
REGLA DE NOMBRE DE ARCHIVO: En nombre_archivo_sugerido NO repitas la lateralidad. Si region ya dice "hombro derecho", el nombre debe ser "Paciente RM hombro derecho", nunca "Paciente RM hombro derecho derecho".
Campos sin contenido → cadena vacía "", nunca "null" como texto.`;

const systemPromptAuto = `Eres un parser de transcripciones médicas de radiología. Extrae TODOS los estudios y devuelve JSON via tool call.

Por cada estudio identifica:
- nombre_paciente: nombre completo
- tipo_estudio: TAC o RM
- region: región anatómica
- lateralidad: "derecha"/"izquierda"/"bilateral" o null
- es_contrastado: true/false
- datos_clinicos: texto de "indicación"/"diagnóstico"/"datos clínicos", o ""
- conclusiones: texto de "conclusiones"/"conclusión"/"impresión diagnóstica", o ""
- hallazgos: Copia TEXTUALMENTE y de forma COMPLETA absolutamente todo el texto dictado que no sea conclusiones ni datos_clinicos. No resumas, no omitas, no parafrasees ninguna palabra. El campo hallazgos debe ser una copia fiel y completa del dictado original.
- plantilla_match: nombre exacto de la plantilla de la lista, o null
- nombre_archivo_sugerido: nombre_paciente + tipo_estudio + region. NO repitas la lateralidad si ya está incluida en la región.

REGLAS DE PLANTILLA:
1. TAC → solo plantillas con "TAC". RM → solo plantillas con "RM". NUNCA mezclar.
2. TAC de hombro/tobillo/mano/pie/cadera/pierna/brazo/rodilla → plantilla con "musculoesquelético".
3. TAC abdomen/tórax/toracoabdominal sin "simple" → usar plantilla contrastada.
4. RM hombro: "ruptura parcial"→"parcial"; "ruptura completa"→"completa"; sin ruptura→"tendinosis".
5. Campos sin contenido → cadena vacía "", nunca "null" como texto.
REGLA ESTUDIOS BILATERALES: Si el médico dicta el mismo tipo de estudio para lado derecho e izquierdo por separado, crea DOS estudios separados, uno por cada lado. Nunca los fusiones en uno solo.
REGLA CONTENIDO COMPLETO: Es absolutamente prohibido omitir, resumir o parafrasear cualquier parte del dictado. Todo el texto original debe aparecer distribuido entre hallazgos, conclusiones y datos_clinicos sin que se pierda ni una sola palabra.
REGLA DE NOMBRE DE ARCHIVO: En nombre_archivo_sugerido NO repitas la lateralidad. Si region ya dice "hombro derecho", el nombre debe ser "Paciente RM hombro derecho", nunca "Paciente RM hombro derecho derecho".`;

const tools = [{
  type: 'function',
  function: {
    name: 'parse_transcription_result',
    description: 'Return ALL parsed studies from the transcription',
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
  if (!GROQ_API_KEY)
    return res.status(500).json({ error: 'GROQ_API_KEY no configurado' });

  const { transcriptionText, templateNames, modoManual } = req.body || {};
  if (!transcriptionText)
    return res.status(400).json({ error: 'Se requiere transcriptionText' });

  try {
    let systemFinal;

    if (modoManual) {
      systemFinal = systemPromptManual;
      console.log('[parse-transcription] Modo manual — sin plantillas');
    } else {
      const textoLower = transcriptionText.toLowerCase();
      const esTAC = textoLower.includes('tac');
      const esRM = textoLower.includes(' rm ') || textoLower.includes('resonancia');

      const plantillasFiltradas = (templateNames || []).filter(nombre => {
        const n = nombre.toLowerCase();
        if (esTAC && !esRM) return n.includes('tac');
        if (esRM && !esTAC) return n.includes('rm') || n.includes('++rm');
        return true;
      });

      const plantillasAUsar = plantillasFiltradas.length >= 3
        ? plantillasFiltradas
        : (templateNames || []);

      console.log(`[parse-transcription] Modo auto — ${plantillasAUsar.length} plantillas de ${(templateNames||[]).length}`);
      systemFinal = `${systemPromptAuto}\n\nPLANTILLAS DISPONIBLES:\n${plantillasAUsar.join('\n')}`;
    }

    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemFinal },
          { role: 'user', content: transcriptionText },
        ],
        tools,
        tool_choice: { type: 'function', function: { name: 'parse_transcription_result' } },
        temperature: 0.1,
        max_tokens: modoManual ? 8000 : 4000,
      }),
    });

    const responseText = await groqResponse.text();

    if (!groqResponse.ok) {
      let errMsg = 'Error al comunicarse con Groq';
      try { errMsg = JSON.parse(responseText).error?.message || errMsg; } catch { errMsg = responseText || errMsg; }
      return res.status(groqResponse.status).json({ error: errMsg });
    }

    const aiData = JSON.parse(responseText);
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      const content = aiData.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || content.match(/(\{[\s\S]*\})/);
      if (!jsonMatch)
        return res.status(500).json({ error: 'No se pudo parsear la respuesta de Groq' });
      return res.status(200).json(JSON.parse(jsonMatch[1] || jsonMatch[0]));
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    console.log(`[parse-transcription] ✅ ${parsed.estudios?.length || 0} estudios detectados`);
    return res.status(200).json(parsed);

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[parse-transcription] Error:', msg);
    return res.status(500).json({ error: msg });
  }
};
