module.exports.config = {
  api: { bodyParser: { sizeLimit: '2mb' } },
};

const SYSTEM_PROMPT = `Actúas únicamente sobre el texto proporcionado por el usuario.
No inventes información ni agregues hechos no presentes en el texto original.
Limítate estrictamente a las instrucciones del usuario.
REGLA NEGRITA: Solo aplica negrita (<b></b>) cuando el usuario lo pida explícitamente. Preserva etiquetas <b> existentes.
Responde SOLO con el texto modificado, sin explicaciones.`;

module.exports.default = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY)
    return res.status(500).json({ error: 'GROQ_API_KEY no configurado' });

  const { text, instruction } = req.body;
  if (!text || !instruction)
    return res.status(400).json({ error: 'text e instruction son requeridos' });

  try {
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `TEXTO:\n\n${text}\n\nINSTRUCCIÓN:\n${instruction}` },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    const responseText = await groqResponse.text();

    if (!groqResponse.ok) {
      if (groqResponse.status === 429)
        return res.status(429).json({ error: 'Límite de tokens alcanzado, espera 60 segundos e intenta de nuevo.' });
      return res.status(500).json({ error: 'Error al editar con Groq', detalle: responseText });
    }

    const result = JSON.parse(responseText);
    const editedText = (result.choices?.[0]?.message?.content || '').trim();

    return res.status(200).json({ success: true, editedText });

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: msg });
  }
};
