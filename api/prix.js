export const config = { runtime: "edge", maxDuration: 30 };

export default async function handler(req) {
  const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const cp = searchParams.get("cp") || "75001";
  const key = process.env.ANTHROPIC_API_KEY;
  if (!q) return new Response(JSON.stringify({ error: "q requis" }), { status: 400, headers: cors });

  const prompt = `Utilise web_search pour trouver le prix de "${q}" dans les supermarchés français.
Cherche: site:carrefour.fr "${q}" prix, site:auchan.fr "${q}" prix, site:monoprix.fr "${q}" prix.
Ensuite donne UNIQUEMENT ce JSON (sans markdown, sans explication):
{"leclerc":null,"carrefour":null,"intermarche":null,"lidl":null,"auchan":null,"monoprix":null}
Remplace null par le prix en euros trouvé pour chaque enseigne.`;

  try {
    // Tour 1: laisser Claude chercher
    const r1 = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        tool_choice: { type: "auto" },
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const d1 = await r1.json();
    if (!r1.ok) return new Response(JSON.stringify({ error: d1.error?.message, status: r1.status }), { headers: cors });

    // Construire les messages pour le tour 2
    const msgs = [
      { role: "user", content: prompt },
      { role: "assistant", content: d1.content },
    ];

    // Si tool_use, ajouter les résultats et demander le JSON
    const toolUses = d1.content?.filter(b => b.type === "tool_use") || [];
    if (toolUses.length > 0) {
      msgs.push({ role: "user", content: [
        ...toolUses.map(tu => ({ type: "tool_result", tool_use_id: tu.id, content: "Résultats de recherche disponibles." })),
        { type: "text", text: "Maintenant génère uniquement le JSON des prix. Format: {\"leclerc\":x,\"carrefour\":x,\"intermarche\":x,\"lidl\":x,\"auchan\":x,\"monoprix\":x} - null si non trouvé." }
      ]});
      
      const r2 = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 300,
          messages: msgs,
        }),
      });
      const d2 = await r2.json();
      const txt2 = d2.content?.find(b => b.type === "text")?.text || "";
      const m2 = txt2.match(/\{[^{}]{10,200}\}/);
      if (m2) {
        try {
          return new Response(JSON.stringify({ product: q, prices: JSON.parse(m2[0]) }), { headers: cors });
        } catch(e) {}
      }
      return new Response(JSON.stringify({ product: q, prices: { leclerc:null,carrefour:null,intermarche:null,lidl:null,auchan:null,monoprix:null }, raw: txt2.slice(0,300) }), { headers: cors });
    }

    // Pas de tool_use — chercher JSON dans réponse directe
    const txt = d1.content?.find(b => b.type === "text")?.text || "";
    const m = txt.match(/\{[^{}]{10,200}\}/);
    if (m) {
      try {
        return new Response(JSON.stringify({ product: q, prices: JSON.parse(m[0]) }), { headers: cors });
      } catch(e) {}
    }
    return new Response(JSON.stringify({ product: q, prices: { leclerc:null,carrefour:null,intermarche:null,lidl:null,auchan:null,monoprix:null } }), { headers: cors });

  } catch(err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}