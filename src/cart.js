// cart.js — Automatisation Leclerc Drive via API directe
// Le script est injecté dans l'onglet Leclerc par l'extension Claude
// Pas de navigation entre pages — tout via fetch + panier.aspx

let _running = false
let _win = null

export function stopCart() {
  _running = false
  _win = null
  localStorage.removeItem('pm_cart')
}

// ═══════════════════════════════════════════════
// Script injecté dans l'onglet Leclerc par l'extension
// S'auto-exécute et traite toute la queue via l'API Leclerc
// ═══════════════════════════════════════════════
export const PILOT = `(async function() {
  const data = JSON.parse(localStorage.getItem('pm_pilot') || 'null');
  if (!data || !data.queue) return;
  const { queue, storeNum } = data;
  
  async function getProductId(search) {
    const url = location.origin + '/magasin-' + storeNum + '-' + storeNum +
      '-Rueil-Malmaison-Boulevard-National/recherche.aspx?TexteRecherche=' + encodeURIComponent(search);
    const html = await fetch(url, { credentials: 'include' }).then(r => r.text());
    const m = html.match(/"iIdProduit":"?(\\d+)"?/);
    return m?.[1] || null;
  }
  
  async function addToCart(id, search) {
    const body = 'd=' + encodeURIComponent(JSON.stringify({
      eTypeAction: 1, iIdProduit: String(id), iQuantite: 1,
      sNoPointLivraison: storeNum,
      objContexteProvenanceArticle: { eOrigine: 4, eTypePage: 3, sTexteRecherche: search, eVue: 0, sInformationsComplementaires: 'uni-1' }
    }));
    const res = await fetch(location.origin + '/magasin-' + storeNum + '/panier.aspx?op=1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'include', body
    });
    return res.ok;
  }
  
  window._pmRunning = true;
  for (let i = 0; i < queue.length; i++) {
    if (!window._pmRunning) break;
    const { search } = queue[i];
    document.title = '⏳ ' + (i+1) + '/' + queue.length + ' — ' + search;
    try {
      const id = await getProductId(search);
      if (id) {
        await addToCart(id, search);
      }
    } catch(e) {}
    // Mettre à jour localStorage pour la progress bar de Prix Malin
    const pm = JSON.parse(localStorage.getItem('pm_cart') || '{}');
    pm.done = i + 1;
    localStorage.setItem('pm_cart', JSON.stringify(pm));
    await new Promise(r => setTimeout(r, 600));
  }
  window._pmRunning = false;
  document.title = '✅ Panier complet ! ' + queue.length + ' produits';
  location.reload(); // Recharger pour voir le vrai total
})()`

export function startCart(storeId, products, driveConfig, onProgress) {
  if (_running) return
  _running = true
  const cfg = driveConfig[storeId]
  if (!cfg) { _running = false; return }

  // Dédupliquer
  const seen = new Set()
  const unique = products.filter(p => {
    if (seen.has(p.search)) return false
    seen.add(p.search)
    return true
  })

  const queue = unique.map(p => ({ search: p.search }))
  const storeNum = '169203'

  // Stocker dans localStorage — accessible par l'onglet Leclerc (même si cross-origin, on utilise pm_pilot)
  // NOTE: localStorage est same-origin donc Leclerc ne peut pas lire pm_cart de prix-malin
  // On passe via window.name que le script lit
  localStorage.setItem('pm_cart', JSON.stringify({
    storeId, queue, total: queue.length, done: 0, status: 'running'
  }))

  // Ouvrir l'onglet Leclerc
  const homeUrl = 'https://fd3-courses.leclercdrive.fr/magasin-169203-169203-Rueil-Malmaison-Boulevard-National/default.aspx'
  const w = window.open(homeUrl, '_cart_lec')
  _win = w

  // Passer la queue via window.name (lisible depuis l'onglet Leclerc)
  if (w) {
    try { w.name = 'pm_pilot:' + JSON.stringify({ queue, storeNum }) } catch(e) {}
  }

  // Exposer pour que l'extension puisse injecter le pilote
  window._pmQueue = queue
  window._pmStoreNum = storeNum
  window._pmPilot = PILOT

  onProgress(0)

  // Poller pm_cart.done pour la progress bar
  ;(async () => {
    while (_running) {
      await new Promise(r => setTimeout(r, 800))
      try {
        const raw = localStorage.getItem('pm_cart')
        if (!raw) { _running = false; break }
        const d = JSON.parse(raw)
        onProgress(d.done || 0)
        if ((d.done || 0) >= d.total) { _running = false; break }
      } catch(e) { break }
    }
    _running = false
  })()
}
