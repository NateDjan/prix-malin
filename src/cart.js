
export const CART_SEL = {
  leclerc:     '.aWCRS310_Add',
  carrefour:   'button[aria-label*="Ajouter le produit"]',
  intermarche: '.add-to-cart-button',
  auchan:      '.add-to-cart',
  monoprix:    '.btn-addtocart',
  lidl:        '.m-button--primary',
}

let _running = false
let _cartWin = null

export function stopCart() {
  _running = false
  _cartWin = null
}

export function continueCart(products, sel, onProgress) {
  const w = _cartWin
  if (!w || w.closed) { _running = false; onProgress && onProgress(0); return }

  ;(async () => {
    for (let i = 0; i < products.length; i++) {
      if (!_running) break
      onProgress(i)

      try { w.location.href = products[i].url } catch(e) { break }

      // Attendre page chargée + TexteRecherche dans l'URL
      let ready = false
      for (let t = 0; t < 30; t++) {
        await new Promise(r => setTimeout(r, 500))
        try {
          if (w.document.readyState === 'complete' && w.location.href.includes('TexteRecherche')) {
            ready = true; break
          }
        } catch(e) {}
      }
      if (!ready || !_running) { onProgress(i + 1); continue }

      // Attendre JS Leclerc
      await new Promise(r => setTimeout(r, 1500))

      // Cliquer avec retry
      for (let t = 0; t < 15; t++) {
        try {
          const btn = w.document.querySelector(sel)
          if (btn && !btn.classList.contains('inactive') && !btn.classList.contains('WCTD_disabled') && !btn.disabled) {
            btn.click()
            break
          }
        } catch(e) {}
        await new Promise(r => setTimeout(r, 400))
      }

      onProgress(i + 1)
      // Pause entre produits pour que Leclerc digère
      await new Promise(r => setTimeout(r, 800))
    }

    onProgress(products.length)
    _running = false
  })()
}

export function startCart(storeId, products, driveConfig, onProgress) {
  if (_running) return
  _running = true
  const cfg = driveConfig[storeId]
  if (!cfg) return

  const homeUrl = storeId === 'leclerc'
    ? 'https://fd3-courses.leclercdrive.fr/magasin-169203-169203-Rueil-Malmaison-Boulevard-National/default.aspx'
    : cfg.url(products[0].search)

  // Ouvrir un onglet nommé '_cart_lec'
  const w = window.open(homeUrl, '_cart_lec')
  if (!w) { _running = false; return }
  _cartWin = w

  // Exposer sur window pour que le bouton Continuer y accède
  window._cartQueue = products.map(p => ({ search: p.search, url: cfg.url(p.search) }))
  window._cartSel = CART_SEL[storeId] || '.aWCRS310_Add'
  window._cartOnProgress = onProgress

  // -1 = état "attente connexion"
  onProgress(-1)
}
