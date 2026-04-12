// Cart.js - écrit la queue dans localStorage
// L'extension Claude in Chrome pilote l'onglet avec de vrais clics physiques
// via le mécanisme de shortcut

export const CART_SEL = {
  leclerc:     '.aWCRS310_Add',
  carrefour:   'button[aria-label*="Ajouter le produit"]',
  intermarche: '.add-to-cart-button',
  auchan:      '.add-to-cart',
  monoprix:    '.btn-addtocart',
  lidl:        '.m-button--primary',
}

let _running = false

export function stopCart() {
  _running = false
  localStorage.removeItem('pm_cart')
}

export function startCart(storeId, products, driveConfig, onProgress) {
  if (_running) return
  _running = true
  const cfg = driveConfig[storeId]
  if (!cfg) return

  // Stocker la queue dans localStorage
  const queue = products.map(p => ({
    search: p.search,
    url: cfg.url(p.search)
  }))

  localStorage.setItem('pm_cart', JSON.stringify({
    storeId, queue, total: queue.length, done: 0, status: 'waiting'
  }))

  // Ouvrir l'onglet Leclerc sur le 1er produit
  const w = window.open(cfg.url(products[0].search), '_cart_lec')
  if (!w) {
    const a = document.createElement('a')
    a.href = cfg.url(products[0].search)
    a.target = '_cart_lec'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  onProgress(0)

  // Poller localStorage pour la progress bar
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
