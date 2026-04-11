export const config = { runtime: "edge", maxDuration: 30 };

export default async function handler(req) {
  const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const cp = searchParams.get("cp") || "75001";
  const key = process.env.ANTHROPIC_API_KEY;

  if (!q) return new Response(JSON.stringify({ error: "q requis" }), { status: 400, headers: cors });

  try {
    // Utiliser Claude avec web_search pour trouver les vrais prix
    const prompt = `Cherche le prix actuel de "${q}" dans les supermarchés français suivants: E.Leclerc, Carrefour, Intermarché, Lidl, Auchan, Monoprix (région code postal ${cp}).

Utilise web_search pour trouver les prix réels sur leurs sites ou sur Google Shopping.

Réponds UNIQUEMENT avec ce JSON valide (pas de markdown):
{
  "product": "${q}",
  "prices": {
    "leclerc": 0.00,
    "carrefour": 0.00,
    "intermarche": 0.00,
    "lidl": 0.00,
    "auchan": 0.00,
    "monoprix": 0.00
  },
  "unit": "par unité/kg/L",
  "source": "sites officiels"
}

Si le prix d'une enseigne n'est pas trouvé, mets null.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1000,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await res.json();
    
    // Extraire le texte de la réponse (après le tool use)
    const textBlock = data.content?.find(b => b.type === "text");
    if (!textBlock) {
      return new Response(JSON.stringify({ error: "Pas de texte", data: data.content?.map(b=>b.type) }), { headers: cors });
    }
    
    // Parser le JSON de la réponse
    const text = textBlock.text;
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return new Response(JSON.stringify({ error: "Pas de JSON", text: text.slice(0,200) }), { headers: cors });
    
    const result = JSON.parse(m[0]);
    return new Response(JSON.stringify(result), { headers: cors });

  } catch(err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}