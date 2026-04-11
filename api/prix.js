export const config = { runtime: "edge", maxDuration: 30 };

export default async function handler(req) {
  const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const cp = searchParams.get("cp") || "75001";
  if (!q) return new Response(JSON.stringify({ error: "q requis" }), { status: 400, headers: cors });

  try {
    // URL correcte avec /resultats
    const url = "https://www.quiestlemoinscher.leclerc/resultats?cp=" + encodeURIComponent(cp) + "&q=" + encodeURIComponent(q);
    const res = await fetch(url, {
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
        "Cache-Control": "no-cache",
        "Referer": "https://www.quiestlemoinscher.leclerc/",
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "same-origin",
      }
    });

    const location = res.headers.get("location") || "";
    const html = await res.text();
    const finalUrl = res.url;
    const status = res.status;

    // Extraire __NEXT_DATA__
    const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (m) {
      try {
        const nd = JSON.parse(m[1]);
        const pp = nd?.props?.pageProps;
        const keys = Object.keys(pp || {});
        
        // Chercher produits/comparaison dans tous les keys
        const products = pp?.products || pp?.comparisons || pp?.items || pp?.results || pp?.data || null;
        
        return new Response(JSON.stringify({
          status, location, finalUrl,
          pageProps_keys: keys,
          products: products,
          rawPageProps: pp,
          htmlLen: html.length,
        }), { headers: cors });
      } catch(e) {
        return new Response(JSON.stringify({ error: "JSON parse: " + e.message, htmlLen: html.length }), { headers: cors });
      }
    }

    // Pas de __NEXT_DATA__ - retourner infos debug
    return new Response(JSON.stringify({
      status, location, finalUrl,
      htmlLen: html.length,
      noNextData: true,
      sample: html.slice(0, 2000),
    }), { headers: cors });

  } catch(err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}