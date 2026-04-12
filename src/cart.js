
export const CART_SEL = {
  leclerc: '.aWCRS310_Add',
  carrefour: 'button[aria-label*="Ajouter le produit"]',
  intermarche: '.add-to-cart-button',
  auchan: '.add-to-cart',
  monoprix: '.btn-addtocart',
  lidl: '.m-button--primary',
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
  const sel = CART_SEL[storeId] || '.aWCRS310_Add'

  // Stocker la queue dans localStorage pour que l'extension la lise
  const queue = products.map(p => ({ search: p.search, url: cfg.url(p.search) }))
  localStorage.setItem('pm_cart', JSON.stringify({
    storeId, sel, queue, total: queue.length,
    current: 0, done: 0, ts: Date.now()
  }))

  onProgress(0)

  // Poller localStorage['pm_cart'].done pour mettre à jour la progress bar
  ;(async () => {
    while (_running) {
      await new Promise(r => setTimeout(r, 500))
      try {
        const data = JSON.parse(localStorage.getItem('pm_cart') || '{}')
        if (!data.queue) break
        onProgress(data.done || 0)
        if ((data.done || 0) >= data.total) break
      } catch(e) { break }
    }
    if (_running) {
      const data = JSON.parse(localStorage.getItem('pm_cart') || '{}')
      onProgress(data.total || products.length)
    }
    _running = false
    localStorage.removeItem('pm_cart')
  })()
}
