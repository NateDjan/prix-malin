export const config = { runtime: "edge", maxDuration: 30 };

export default async function handler(req) {
  const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  try {
    const { messages = [], system } = await req.json();

    const hasImage = Array.isArray(messages) && messages.some(m =>
      Array.isArray(m.content) && m.content.some(c => c.type === "image_url")
    );

    const msgs = [
      { role: "system", content: system || "Reponds uniquement en JSON valide." },
      ...messages
    ];

    const providers = [
      {
        name: "openai",
        key: process.env.OPENAI_API_KEY,
        endpoint: "https://api.openai.com/v1/chat/completions",
        model: hasImage ? "gpt-4o-mini" : "gpt-4o-mini",
        payload(model) {
          return { model, temperature: 0, max_tokens: 4000, messages: msgs };
        }
      },
      {
        name: "groq",
        key: process.env.GROQ_API_KEY,
        endpoint: "https://api.groq.com/openai/v1/chat/completions",
        model: hasImage ? "meta-llama/llama-4-scout-17b-16e-instruct" : "llama-3.3-70b-versatile",
        payload(model) {
          return { model, temperature: 0, max_tokens: 4000, messages: msgs };
        }
      }
    ].filter(p => !!p.key);

    if (!providers.length) {
      return new Response(
        JSON.stringify({ error: "Aucune clé API disponible" }),
        { status: 500, headers: cors }
      );
    }

    let lastStatus = 500;
    let lastError = "Erreur AI";
    let lastDetail;

    for (const p of providers) {
      const r = await fetch(p.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.key}` },
        body: JSON.stringify(p.payload(p.model))
      });

      let d;
      try {
        d = await r.json();
      } catch (e) {
        d = null;
      }

      if (r.ok) {
        let text = d.choices?.[0]?.message?.content || "";

        // Supprimer les balises de raisonnement <think>...</think>
        text = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

        // Supprimer les blocs markdown
        text = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();

        // Supprimer tout texte avant le 1er { et après le dernier }
        const s = text.indexOf("{");
        const e = text.lastIndexOf("}");
        if (s !== -1 && e !== -1) text = text.slice(s, e + 1);

        return new Response(JSON.stringify({ text }), { headers: cors });
      }

      lastStatus = r.status || 500;
      lastError = d?.error?.message || `Erreur ${p.name}`;
      lastDetail = d;

      // Fallback on rate limit / availability issues
      if (lastStatus === 429 || lastStatus === 503) continue;

      // otherwise stop early (auth error, etc.)
      break;
    }

    return new Response(
      JSON.stringify({ error: lastError, detail: lastDetail }),
      { status: lastStatus, headers: cors }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}
