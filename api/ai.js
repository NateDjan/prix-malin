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

    // Llama 4 Scout supporte texte + images, Llama 3.3 70B pour texte seul
    const model = hasImage
      ? "meta-llama/llama-4-scout-17b-16e-instruct"
      : "llama-3.3-70b-versatile";

    // Pour Llama 4 Scout avec images : system prompt dans messages
    let msgs;
    if (hasImage) {
      // Llama 4 supporte le system prompt separé
      msgs = [
        { role: "system", content: system || "Reponds uniquement en JSON valide." },
        ...messages
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