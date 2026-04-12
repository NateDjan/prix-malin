
export const CART_SEL = {
  leclerc:     '.aWCRS310_Add',
  carrefour:   'button[aria-label*="Ajouter le produit"]',
  intermarche: '.add-to-cart-button',
  auchan:      '.add-to-cart',
  monoprix:    '.btn-addtocart',
  lidl:        '.m-button--primary',
}

let _running = false
export function stopCart() { _running = false }

export function startCart(storeId, products, driveConfig, onProgress) {
  if (_running) return
  _running = true
  const cfg = driveConfig[storeId]
  if (!cfg) return
  const sel = CART_SEL[storeId] || '.aWCRS310_Add'
  const winName = '_cart_lec'

  // Stocker les produits et le sélecteur dans localStorage
  // pour que la page Leclerc Drive puisse y accéder via window.opener
  // NON - cross-origin
  // On utilise le hash de l'URL pour passer les infos

  ;(async () => {
    let resolveMsg = null
    const msgHandler = (e) => {
      if (e.data === 'cart_done' || e.data === 'cart_timeout') {
        resolveMsg && resolveMsg(e.data)
      }
    }
    window.addEventListener('message', msgHandler)

    for (let i = 0; i < products.length; i++) {
      if (!_running) break
      onProgress(i)
      const url = cfg.url(products[i].search)

      // Créer un lien SANS rel="noopener" pour garder window.opener
      const a = document.createElement('a')
      a.href = url
      a.target = winName
      // PAS de rel="noopener" — permet window.opener.postMessage
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)

      // Attendre postMessage (max 15s)
      await new Promise(r => {
        resolveMsg = r
        setTimeout(() => r('timeout'), 15000)
      })
      resolveMsg = null
      await new Promise(r => setTimeout(r, 600))
    }

    window.removeEventListener('message', msgHandler)
    onProgress(products.length)
    _running = false
  })()
}
