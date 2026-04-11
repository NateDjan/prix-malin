export const config = { runtime: "edge", maxDuration: 30 };

export default async function handler(req) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET; OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const cp = searchParams.get("cp") || "75001";

  if (!q) return new Response(JSON.stringify({ error: "q requis" }), {
    status: 400, headers: { ...cors, "Content-Type": "application/json" }
  });

  try {
    const url = `https://www.quiestlemoinscher.leclerc/search?q=${encodeURIComponent(q)}&cp=${encodeURIComponent(cp)}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9",
        "Referer": "https://www.quiestlemoinscher.leclerc/",
      },
    });

    const html = await res.text();
    const finalUrl = res.url;

    // Extraire __NEXT_DATA__ qui contient les prix
    const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">(\{[\s\S]*?\})<\/script>/);
    if (m) {
      try {
        const nd = JSON.parse(m[1]);
        const pp = nd?.props?.pageProps;
        const prods = pp?.products || pp?.searchResults || pp?.initialProducts || [];
        if (prods.length > 0) {
          return new Response(JSON.stringify({ products: prods, url: finalUrl }), {
            headers: { ...cors, "Content-Type": "application/json" },
          });
        }
        // Retourner pageProps pour debug
        return new Response(JSON.stringify({ pageProps: pp, url: finalUrl, keys: Object.keys(pp || {}) }), {
          headers: { ...cors, "Content-Type": "application/json" },
        });
      } catch(e) {}
    }

    return new Response(JSON.stringify({
      url: finalUrl,
      redirected: finalUrl !== url,
      htmlUrl: html.length,
      sample: html.slice(0, 3000),
    }), { headers: { ...cors, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" }
    });
  }
}
