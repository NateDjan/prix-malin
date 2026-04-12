
export const CART_SEL = {
  leclerc: '.aWCRS310_Add',
  carrefour: 'button[aria-label*="Ajouter le produit"]',
  intermarche: '.add-to-cart-button',
  auchan: '.add-to-cart',
  monoprix: '.btn-addtocart',
  lidl: '.m-button--primary',
}

let _running = false
let _cartWin = null

export function stopCart() {
  _running = false
  try { if (_cartWin) _cartWin.close() } catch(e) {}
  _cartWin = null
}

// Appelée depuis le bouton "Continuer" après connexion
export function continueCart(products, sel, onProgress) {
  const w = _cartWin
  if (!w || w.closed) { _running = false; return }

  ;(async () => {
    for (let i = 0; i < products.length; i++) {
      if (!_running) break
      onProgress(i)

      // Naviguer vers la page de recherche du produit
      try { w.location.href = products[i].url } catch(e) { break }

      // Attendre la page
      let ready = false
      for (let t = 0; t < 30; t++) {
        await new Promise(r => setTimeout(r, 500))
        try {
          if (w.document.readyState === 'complete' && w.location.href.includes('TexteRecherche')) {
            ready = true; break
          }
        } catch(e) {}
      }
      if (!ready) { onProgress(i); continue }

      await new Promise(r => setTimeout(r, 1200))

      // Cliquer
      for (let t = 0; t < 12; t++) {
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
      await new Promise(r => setTimeout(r, 600))
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

  // Ouvrir l'onglet Leclerc (page accueil pour que les cookies soient là)
  const homeUrl = storeId === 'leclerc'
    ? 'https://fd3-courses.leclercdrive.fr/magasin-169203-169203-Rueil-Malmaison-Boulevard-National/default.aspx'
    : cfg.url(products[0].search)

  const w = window.open(homeUrl, '_cart_lec')
  if (!w) { _running = false; return }
  _cartWin = w

  // Stocker dans window pour que le bouton "Continuer" y accède
  const queue = products.map(p => ({ search: p.search, url: cfg.url(p.search) }))
  window._cartQueue = queue
  window._cartSel = CART_SEL[storeId] || '.aWCRS310_Add'
  window._cartOnProgress = onProgress

  // Signaler à l'app qu'on attend la connexion
  onProgress(-1)  // -1 = état "attente connexion"
}
