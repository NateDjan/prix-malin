// cart.js — Automatisation Leclerc Drive via API directe
// 1. Ouvre l'onglet Leclerc
// 2. Pour chaque produit : cherche l'ID via la page de résultats, POST à panier.aspx
// Tout se passe dans le même onglet Leclerc sans navigation

let _running = false
let _win = null

export function stopCart() {
  _running = false
  _win = null
  localStorage.removeItem('pm_cart')
}

// Script injecté dans l'onglet Leclerc — s'exécute une fois et traite toute la queue
const PILOT = `
(async function pilotCart(queue, storeNum) {
  const BASE = 'https://fd3-courses.' + location.host.split('.').slice(1).join('.');
  const SEARCH_URL = q => location.origin + '/magasin-' + storeNum + '-' + storeNum + '-Rueil-Malmaison-Boulevard-National/recherche.aspx?TexteRecherche=' + encodeURIComponent(q);
  const PANIER_URL = location.origin + '/magasin-' + storeNum + '/panier.aspx?op=1';
  
  async function getProductId(searchTerm) {
    const res = await fetch(SEARCH_URL(searchTerm));
    const html = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const li = doc.querySelector('#ulListeProduits > li');
    if (!li) return null;
    // L'ID est dans data-track-id ou dans les attributs du bouton
    const btn = li.querySelector('.aWCRS310_Add') || li.querySelector('.aWCRS310_More');
    const trackId = li.querySelector('[data-track-id]')?.getAttribute('data-track-id');
    // Chercher dans le HTML l'iIdProduit
    const m = html.match(/"iIdProduit":"(\\d+)"/);
    return m?.[1] || trackId || null;
  }
  
  async function addToCart(productId, searchTerm, qty) {
    const body = 'd=' + encodeURIComponent(JSON.stringify({
      eTypeAction: 1,
      iIdProduit: String(productId),
      iQuantite: qty || 1,
      sNoPointLivraison: storeNum,
      objContexteProvenanceArticle: { eOrigine: 4, eTypePage: 3, sTexteRecherche: searchTerm, eVue: 0, sInformationsComplementaires: 'uni-1' }
    }));
    const res = await fetch(PANIER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'include',
      body
    });
    return res.ok;
  }
  
  window._pmDone = 0;
  window._pmTotal = queue.length;
  document.title = '🛒 0/' + queue.length + ' - Démarrage...';
  
  for (let i = 0; i < queue.length; i++) {
    if (!window._pmRunning) break;
    const { search, qty } = queue[i];
    document.title = '⏳ ' + (i+1) + '/' + queue.length + ' - ' + search;
    try {
      const id = await getProductId(search);
      if (id) {
        await addToCart(id, search, qty || 1);
      }
    } catch(e) {}
    window._pmDone = i + 1;
    document.title = '✅ ' + (i+1) + '/' + queue.length + ' - ' + search;
    await new Promise(r => setTimeout(r, 800));
  }
  
  window._pmRunning = false;
  document.title = '✅ Panier complet ! ' + queue.length + ' produits';
  window._pmDone = queue.length;
})
`

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

  const queue = unique.map(p => ({ search: p.search, qty: 1 }))
  const storeNum = '169203' // Rueil-Malmaison — à rendre configurable plus tard

  localStorage.setItem('pm_cart', JSON.stringify({
    storeId, queue, total: queue.length, done: 0, status: 'running'
  }))

  // Ouvrir l'onglet Leclerc sur la home (pas besoin d'être sur un produit spécifique)
  const homeUrl = 'https://fd3-courses.leclercdrive.fr/magasin-169203-169203-Rueil-Malmaison-Boulevard-National/default.aspx'
  const w = window.open(storeId === 'leclerc' ? homeUrl : cfg.url(queue[0].search), '_cart_lec')
  _win = w

  // Injecter le script pilote après chargement (3s)
  if (w) {
    // Passer la queue et démarrer via window.name (lisible cross-origin)
    // Le script sera injecté par l'extension Claude
    // On stocke les données dans window.name pour que l'extension les lise
    try {
      w.name = 'pm_pilot:' + JSON.stringify({ queue, storeNum })
    } catch(e) {}
  }

  // Exposer le script pilote sur window pour que l'extension puisse l'injecter
  window._pmPilotScript = PILOT
  window._pmQueue = queue
  window._pmStoreNum = storeNum

  onProgress(0)

  // Poller le titre de l'onglet Leclerc pour la progress bar
  ;(async () => {
    while (_running) {
      await new Promise(r => setTimeout(r, 800))
      try {
        if (!_win || _win.closed) { _running = false; break }
        // Lire la progression depuis window._pmDone du tab Leclerc
        // (pas accessible cross-origin, on poll localStorage à la place)
        const raw = localStorage.getItem('pm_cart')
        if (!raw) { _running = false; break }
        const data = JSON.parse(raw)
        onProgress(data.done || 0)
        if ((data.done || 0) >= data.total) { _running = false; break }
      } catch(e) { break }
    }
    _running = false
  })()
}
