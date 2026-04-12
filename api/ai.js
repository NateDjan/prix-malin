export const config = { runtime: "edge", maxDuration: 30 };

export default async function handler(req) {
  const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  try {
    const { messages, system } = await req.json();
    const key = process.env.GROQ_API_KEY;
    if (!key) return new Response(JSON.stringify({ error: "GROQ_API_KEY manquante" }), { status: 500, headers: cors });

    // Detecter si le message contient une image
    const hasImage = messages.some(m => 
      Array.isArray(m.content) && m.content.some(c => c.type === 'image_url')
    );

    // Choisir le bon modele : vision pour images, texte pour le reste
    const model = hasImage ? "llama-3.2-90b-vision-preview" : "llama-3.3-70b-versatile";

    // Construire les messages : system comme premier message user si vision
    // car llama vision n'a pas de system prompt separé
    let msgs;
    if (hasImage) {
      // Pour vision : inclure le system dans le premier message
      msgs = [
        { role: "user", content: [
          { type: "text", text: (system || "") + "\n\n" + (typeof messages[0].content === 'string' ? messages[0].content : "") },
          ...messages.flatMap(m => Array.isArray(m.content) ? m.content.filter(c => c.type === 'image_url') : [])
        ]}
      ];
    } else {
      msgs = [
        { role: "system", content: system || "Reponds uniquement en JSON valide." },
        ...messages
      ];
    }

    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ model, temperature: 0, max_tokens: 4000, messages: msgs })
    });

    const d = await r.json();
    if (!r.ok) return new Response(JSON.stringify({ 
      error: d.error?.message || "Erreur Groq", detail: d
    }), { status: 500, headers: cors });
    
    return new Response(JSON.stringify({ 
      text: d.choices?.[0]?.message?.content || "" 
    }), { headers: cors });
  } catch(err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}