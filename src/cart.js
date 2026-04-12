// cart.js - L'app stocke les produits dans localStorage
// L'extension Claude pilote l'onglet Leclerc avec de vrais clics physiques

export const CART_SEL = {
  leclerc:     '.aWCRS310_Add',
  carrefour:   'button[aria-label*="Ajouter le produit"]',
  intermarche: '.add-to-cart-button',
  auchan:      '.add-to-cart',
  monoprix:    '.btn-addtocart',
  lidl:        '.m-button--primary',
}

// Coordonnées fixes du bouton + sur Leclerc Drive (1er produit)
// Vérifiées par inspection : le bouton est toujours à cette position
const LECLERC_BTN = { cx: 437, cy: 490 }

let _running = false
let _tabId = null // tabId de l'onglet Leclerc piloté par l'extension

export function stopCart() {
  _running = false
  localStorage.removeItem('pm_cart')
}

// Retourne les coordonnées du bouton Add ou More visible sur le 1er produit
export function getLeclercBtnCoords(doc) {
  const li = doc.querySelector('#ulListeProduits > li')
  for (const sel of ['.aWCRS310_Add', '.aWCRS310_More']) {
    const btn = li?.querySelector(sel)
    if (!btn) continue
    const r = btn.getBoundingClientRect()
    if (r.width > 0) return { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), sel }
  }
  return null
}

export function startCart(storeId, products, driveConfig, onProgress) {
  if (_running) return
  _running = true
  const cfg = driveConfig[storeId]
  if (!cfg) return

  // Dédupliquer les produits
  const seen = new Set()
  const unique = products.filter(p => {
    if (seen.has(p.search)) return false
    seen.add(p.search)
    return true
  })

  // Stocker la queue dans localStorage pour que l'extension la lise
  const queue = unique.map(p => ({ search: p.search, url: cfg.url(p.search) }))
  localStorage.setItem('pm_cart', JSON.stringify({
    storeId, queue, total: queue.length, done: 0, status: 'waiting'
  }))

  // Ouvrir l'onglet Leclerc sur le 1er produit
  const w = window.open(queue[0].url, '_cart_lec')
  if (!w) {
    const a = document.createElement('a')
    a.href = queue[0].url
    a.target = '_cart_lec'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  onProgress(0)

  // Poller localStorage pour mettre à jour la progress bar
  ;(async () => {
    while (_running) {
      await new Promise(r => setTimeout(r, 600))
      try {
        const data = JSON.parse(localStorage.getItem('pm_cart') || 'null')
        if (!data) { _running = false; break }
        onProgress(data.done || 0)
        if (data.status === 'done' || (data.done || 0) >= data.total) {
          _running = false; break
        }
      } catch(e) { break }
    }
    _running = false
  })()
}
