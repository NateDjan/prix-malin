export const config = { runtime: "edge", maxDuration: 30 };

export default async function handler(req) {
  const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const cp = searchParams.get("cp") || "75001";
  const key = process.env.ANTHROPIC_API_KEY;
  if (!q) return new Response(JSON.stringify({ error: "q requis" }), { status: 400, headers: cors });

  const prompt = `Cherche le prix actuel de "${q}" dans les supermarchés français (code postal ${cp}).
Cherche sur carrefour.fr, leclerc.fr, intermarche.com, auchan.fr, lidl.fr, monoprix.fr.
Réponds UNIQUEMENT avec ce JSON (sans markdown):
{"leclerc":0.00,"carrefour":0.00,"intermarche":0.00,"lidl":0.00,"auchan":0.00,"monoprix":0.00}
Mets null si prix non trouvé.`;

  try {
    // Tour 1: avec web_search
    const r1 = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1000,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const d1 = await r1.json();
    
    // Si stop_reason = tool_use, faire un tour 2
    if (d1.stop_reason === "tool_use") {
      const msgs = [
        { role: "user", content: prompt },
        { role: "assistant", content: d1.content },
        { role: "user", content: "Maintenant génère le JSON avec les prix trouvés. JSON uniquement, sans markdown." }
      ];
      const r2 = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 500,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: msgs,
        }),
      });
      const d2 = await r2.json();
      // Chercher le texte dans d2
      const txt = d2.content?.find(b => b.type === "text")?.text || "";
      const m = txt.match(/\{[^{}]*\}/);
      if (m) {
        const prices = JSON.parse(m[0]);
        return new Response(JSON.stringify({ product: q, prices }), { headers: cors });
      }
      return new Response(JSON.stringify({ error: "JSON non trouvé", txt: txt.slice(0,200) }), { headers: cors });
    }
    
    // Stop direct avec texte
    const txt = d1.content?.find(b => b.type === "text")?.text || "";
    const m = txt.match(/\{[^{}]*\}/);
    if (m) {
      const prices = JSON.parse(m[0]);
      return new Response(JSON.stringify({ product: q, prices }), { headers: cors });
    }
    return new Response(JSON.stringify({ error: "Pas de JSON", stop: d1.stop_reason, txt: txt.slice(0,200) }), { headers: cors });

  } catch(err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}