export const config = { runtime: "edge", maxDuration: 30 };

export default async function handler(req) {
  const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const cp = searchParams.get("cp") || "75001";
  if (!q) return new Response(JSON.stringify({ error: "q requis" }), { status: 400, headers: cors });

  try {
    // Le site utilise RSC - il faut appeler l'endpoint RSC directement
    // Format: /resultats?cp=...&q=...&_rsc=<token>
    const rscUrl = "https://www.quiestlemoinscher.leclerc/resultats?cp=" + encodeURIComponent(cp) + "&q=" + encodeURIComponent(q) + "&_rsc=1r34m";
    
    const headers = {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/x-component",
      "Accept-Language": "fr-FR,fr;q=0.9",
      "RSC": "1",
      "Next-Router-State-Tree": "%5B%22%22%2C%7B%22children%22%3A%5B%22resultats%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%5D%7D%5D%7D%2Cnull%2Cnull%2Ctrue%5D",
      "Next-Router-Prefetch": "1",
      "Referer": "https://www.quiestlemoinscher.leclerc/",
    };

    const [resHtml, resRsc] = await Promise.all([
      // 1. Page HTML normale
      fetch("https://www.quiestlemoinscher.leclerc/resultats?cp=" + encodeURIComponent(cp) + "&q=" + encodeURIComponent(q), {
        headers: { ...headers, "Accept": "text/html,*/*" },
        redirect: "manual",
      }),
      // 2. Endpoint RSC  
      fetch(rscUrl, { headers, redirect: "follow" }),
    ]);

    const [html, rscText] = await Promise.all([resHtml.text(), resRsc.text()]);

    // Parser le flux RSC pour trouver les prix
    // Format: nombre:"json" ou nombre:["type",...data...]
    const priceMatches = [];
    
    // Chercher patterns de prix dans le RSC
    const euroPattern = /(d+)[,.](d{2})s*(?:\u20ac|€|euro)/gi;
    let m;
    while ((m = euroPattern.exec(rscText)) !== null) {
      priceMatches.push(parseFloat(m[1] + "." + m[2]));
    }

    // Chercher les noms d'enseignes
    const stores = {};
    const storeNames = ["Leclerc", "Carrefour", "Intermarche", "Auchan", "Lidl", "Monoprix", "Intermarch"];
    storeNames.forEach(s => {
      if (rscText.includes(s)) stores[s] = true;
    });

    // Chercher blocs JSON dans le RSC (format: X:{"...})  
    const jsonBlocks = [];
    const jsonRe = /\d+:\{[\s\S]{10,500}?\}/g;
    let jm;
    while ((jm = jsonRe.exec(rscText.slice(0, 50000))) !== null) {
      try {
        const obj = JSON.parse(jm[0].replace(/^\d+:/, ""));
        if (obj && typeof obj === "object") jsonBlocks.push(obj);
      } catch(e) {}
    }

    return new Response(JSON.stringify({
      htmlStatus: resHtml.status,
      htmlLocation: resHtml.headers.get("location"),
      rscStatus: resRsc.status,
      rscLen: rscText.length,
      rscSample: rscText.slice(0, 2000),
      priceMatches: priceMatches.slice(0, 20),
      storesFound: Object.keys(stores),
      jsonBlocks: jsonBlocks.slice(0, 5),
      htmlLen: html.length,
    }), { headers: cors });

  } catch(err) {
    return new Response(JSON.stringify({ error: err.message, stack: err.stack?.slice(0,200) }), { status: 500, headers: cors });
  }
}