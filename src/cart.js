
export const CART_SEL = {
  leclerc: '.aWCRS310_Add',
  carrefour: 'button[aria-label*="Ajouter le produit"]',
  intermarche: '.add-to-cart-button',
  auchan: '.add-to-cart',
  monoprix: '.btn-addtocart',
  lidl: '.m-button--primary',
}

let _running = false
export function stopCart() { _running = false }

// Vérifie si la page Leclerc est une page de résultats valide
// (pas une redirection vers l'accueil ou le login)
function isValidLeclercPage(win) {
  try {
    const url = win.location.href
    // URL de résultats = contient TexteRecherche
    return url.includes('TexteRecherche') || url.includes('recherche')
  } catch(e) { return false }
}

export function startCart(storeId, products, driveConfig, onProgress) {
  if (_running) return
  _running = true
  const cfg = driveConfig[storeId]
  if (!cfg) return
  const sel = CART_SEL[storeId] || '.aWCRS310_Add'

  // Ouvrir le premier onglet synchronement (dans le handler du clic)
  const w = window.open(cfg.url(products[0].search), '_cart_lec')
  if (!w) { _running = false; return }

  onProgress(0)

  let _resolve = null
  const msgHandler = (e) => {
    if ((e.data === 'cart_done' || e.data === 'cart_timeout') && _resolve) {
      _resolve(e.data)
    }
  }
  window.addEventListener('message', msgHandler)

  ;(async () => {
    for (let i = 0; i < products.length; i++) {
      if (!_running) break
      onProgress(i)

      const url = cfg.url(products[i].search)

      // Naviguer dans la fenêtre
      if (i === 0) {
        // Déjà ouvert via window.open
      } else {
        try { w.location.href = url } catch(e) { break }
      }

      // Attendre que la page charge ET que c'est bien une page résultats
      // (pas une redirection login)
      let loaded = false
      for (let t = 0; t < 30; t++) {
        await new Promise(r => setTimeout(r, 500))
        try {
          if (w.closed) { _running = false; break }
          const wUrl = w.location.href
          const ready = w.document.readyState === 'complete'
          // C'est une page résultat valide si elle contient TexteRecherche
          if (ready && wUrl.includes('TexteRecherche')) {
            loaded = true
            break
          }
          // Redirection vers accueil/login détectée
          if (ready && !wUrl.includes('TexteRecherche') && t > 2) {
            // Pas connecté — réessayer en naviguant directement vers l'URL
            w.location.href = url
          }
        } catch(e) {}
      }

      if (!loaded || !_running) break

      // Attendre un peu que le JS de Leclerc finisse
      await new Promise(r => setTimeout(r, 1500))

      // Cliquer le bouton dans la fenêtre popup
      let clicked = false
      for (let t = 0; t < 15; t++) {
        try {
          const btn = w.document.querySelector(sel)
          if (btn && !btn.classList.contains('inactive') && !btn.classList.contains('WCTD_disabled') && !btn.disabled) {
            const panierBefore = w.document.querySelector('.aWCRS381_Montant')?.textContent
            btn.click()
            // Vérifier que le clic a bien fonctionné (pas de redirection)
            await new Promise(r => setTimeout(r, 800))
            try {
              const newUrl = w.location.href
              if (!newUrl.includes('TexteRecherche')) {
                // Redirection = pas connecté, on arrête
                console.log('[Cart] Redirection détectée après clic — pas connecté ?')
                break
              }
            } catch(e) {}
            clicked = true
            break
          }
        } catch(e) {}
        await new Promise(r => setTimeout(r, 400))
      }

      onProgress(i + 1)
      await new Promise(r => setTimeout(r, 500))
    }

    window.removeEventListener('message', msgHandler)
    onProgress(products.length)
    _running = false
    try { w.close() } catch(e) {}
  })()
}
