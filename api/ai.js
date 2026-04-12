export const config = { runtime: "edge", maxDuration: 30 };

export default async function handler(req) {
  const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  try {
    const { messages, system } = await req.json();
    const key = process.env.XAI_API_KEY;
    if (!key) return new Response(JSON.stringify({ error: "XAI_API_KEY manquante" }), { status: 500, headers: cors });

    const body = {
      model: "grok-beta",
      temperature: 0,
      max_tokens: 4000,
      messages: [
        { role: "system", content: system || "Reponds uniquement en JSON valide." },
        ...messages
      ]
    };

    const r = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify(body)
    });

    const d = await r.json();
    // Retourner la réponse complète pour debug
    if (!r.ok) return new Response(JSON.stringify({ 
      error: d.error?.message || "Erreur xAI",
      status: r.status,
      detail: d 
    }), { status: 500, headers: cors });
    
    return new Response(JSON.stringify({ 
      text: d.choices?.[0]?.message?.content || "" 
    }), { headers: cors });
  } catch(err) {
    return new Response(JSON.stringify({ error: err.message, stack: err.stack?.slice(0,200) }), { status: 500, headers: cors });
  }
}