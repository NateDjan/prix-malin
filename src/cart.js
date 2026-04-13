// cart.js — Automatisation Leclerc Drive via API directe panier.aspx
// Utilise le catalogue local pour les IDs connus, fetch pour les inconnus
// Les nouveaux IDs sont mis en cache dans localStorage de Leclerc

import { LECLERC_CATALOG, lookupProduct } from './leclerc-catalog.js'

let _running = false
let _win = null

export function stopCart() {
  _running = false
  _win = null
  localStorage.removeItem('pm_cart')
}

// Script injecté dans l'onglet Leclerc — utilise catalogue + cache localStorage
export const PILOT = `(async function pilot() {
  let data;
  try { data = JSON.parse(window.name.startsWith('pm:') ? window.name.slice(3) : 'null'); } catch(e) {}
  if (!data?.queue) { console.log('PM: no queue'); return; }
  const { queue, storeNum, catalog } = data;

  // Cache localStorage Leclerc (persist entre sessions)
  const CACHE_KEY = 'pm_catalog_' + storeNum;
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch(e) {}
  // Fusionner avec le catalogue pré-rempli
  Object.assign(cache, catalog || {});

  async function getProductId(search) {
    const key = search.toLowerCase().trim();
    // 1. Vérifier cache local d'abord
    if (cache[key]) return cache[key].id;
    // Correspondance partielle dans le cache
    for (const [k, v] of Object.entries(cache)) {
      if (key.includes(k) || k.includes(key)) return v.id;
    }
    // 2. Fallback: fetch la page de recherche
    const url = location.origin + '/magasin-' + storeNum + '-' + storeNum +
      '-Rueil-Malmaison-Boulevard-National/recherche.aspx?TexteRecherche=' + encodeURIComponent(search);
    const html = await fetch(url, { credentials: 'include' }).then(r => r.text());
    const m = html.match(/"iIdProduit":"?(\\d+)"?/);
    if (m) {
      // Mettre en cache pour la prochaine fois
      cache[key] = { id: m[1] };
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch(e) {}
      return m[1];
    }
    return null;
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
    document.title = '\\u23f3 ' + (i+1) + '/' + queue.length + ' \\u2014 ' + search;
    try {
      const id = await getProductId(search);
      if (id) await addToCart(id, search);
    } catch(e) {}
    try { window.name = 'pm:' + JSON.stringify({ ...data, done: i + 1 }); } catch(e) {}
    await new Promise(r => setTimeout(r, 400));
  }
  window._pmRunning = false;
  document.title = '\\u2705 ' + queue.length + ' produits ajout\\u00e9s !';
  window.name = 'pm:done';
  location.reload();
})()`

export function startCart(storeId, products, driveConfig, onProgress) {
  if (_running) return
  _running = true
  const cfg = driveConfig[storeId]
  if (!cfg) { _running = false; return }

  const seen = new Set()
  const unique = products.filter(p => {
    if (seen.has(p.search)) return false
    seen.add(p.search)
    return true
  })

  const queue = unique.map(p => ({ search: p.search }))
  const storeNum = '169203'

  // Construire le catalogue à passer au script (seulement les produits pertinents + tout le catalogue)
  const catalogToPass = {}
  Object.entries(LECLERC_CATALOG).forEach(([k, v]) => { catalogToPass[k] = v })

  localStorage.setItem('pm_cart', JSON.stringify({
    storeId, queue, total: queue.length, done: 0, status: 'running'
  }))

  // Ouvrir l'onglet Leclerc
  const searchUrl = 'https://fd3-courses.leclercdrive.fr/magasin-169203-169203-Rueil-Malmaison-Boulevard-National/recherche.aspx?TexteRecherche=' + encodeURIComponent(queue[0].search)
  const w = window.open(searchUrl, '_cart_lec')
  _win = w

  if (w) {
    setTimeout(() => {
      try {
        w.name = 'pm:' + JSON.stringify({ queue, storeNum, catalog: catalogToPass })
      } catch(e) {}
    }, 50)
  }

  window._pmPilot = PILOT
  window._pmWin = w

  onProgress(0)

  // Poller window.name pour progress bar
  ;(async () => {
    await new Promise(r => setTimeout(r, 3000))
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
