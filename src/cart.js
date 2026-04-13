// cart.js — Automatisation Leclerc Drive via API directe panier.aspx
// Le PILOT script s'injecte dans l'onglet Leclerc via localStorage passé dans window.name

let _running = false
let _win = null

export function stopCart() {
  _running = false
  _win = null
  localStorage.removeItem('pm_cart')
}

// Script injecté dans l'onglet Leclerc — s'exécute seul, appelle l'API pour chaque produit
export const PILOT = `(async function pilot() {
  let data;
  try { data = JSON.parse(window.name.startsWith('pm:') ? window.name.slice(3) : 'null'); } catch(e) {}
  if (!data?.queue) { console.log('PM: no queue in window.name'); return; }
  const { queue, storeNum, pmOrigin } = data;

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
  window._pmDone = 0;
  window._pmTotal = queue.length;

  for (let i = 0; i < queue.length; i++) {
    if (!window._pmRunning) break;
    const { search } = queue[i];
    document.title = '\u23f3 ' + (i+1) + '/' + queue.length + ' \u2014 ' + search;
    try {
      const id = await getProductId(search);
      if (id) await addToCart(id, search);
    } catch(e) { console.error('PM pilot error:', e); }
    window._pmDone = i + 1;
    // Signaler la progression via window.name (lisible depuis Prix Malin cross-origin)
    try {
      window.name = 'pm:' + JSON.stringify({ ...data, done: i + 1 });
    } catch(e) {}
    await new Promise(r => setTimeout(r, 700));
  }

  window._pmRunning = false;
  document.title = '\u2705 Panier complet ! ' + queue.length + ' produits ajout\u00e9s';
  window.name = 'pm:done';
})();`

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

  localStorage.setItem('pm_cart', JSON.stringify({
    storeId, queue, total: queue.length, done: 0, status: 'running'
  }))

  // Ouvrir l'onglet Leclerc sur la page d'accueil
  const homeUrl = 'https://fd3-courses.leclercdrive.fr/magasin-169203-169203-Rueil-Malmaison-Boulevard-National/recherche.aspx?TexteRecherche=' + encodeURIComponent(queue[0].search)
  const w = window.open(homeUrl, '_cart_lec')
  _win = w

  if (w) {
    // Passer la queue via window.name AVANT la navigation (même origin momentanément)
    setTimeout(() => {
      try {
        w.name = 'pm:' + JSON.stringify({ queue, storeNum })
      } catch(e) {}
    }, 50)
  }

  // Exposer le script pilote pour que l'extension puisse l'injecter
  window._pmPilot = PILOT
  window._pmWin = w

  onProgress(0)

  // Poller window.name du tab Leclerc pour la progress bar (window.name est cross-origin readable)
  ;(async () => {
    await new Promise(r => setTimeout(r, 3000)) // Laisser la page charger
    while (_running) {
      await new Promise(r => setTimeout(r, 800))
      try {
        if (!_win || _win.closed) { _running = false; break }
        const name = _win.name
        if (name === 'pm:done') { onProgress(queue.length); _running = false; break }
        if (name?.startsWith('pm:')) {
          const d = JSON.parse(name.slice(3))
          onProgress(d.done || 0)
        }
      } catch(e) {}
    }
    _running = false
  })()
}
