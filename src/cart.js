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

async function clickBtn(win, sel) {
  // Essayer d'abord via jQuery (marche sur Leclerc Drive)
  try {
    if (win.jQuery) {
      const $btn = win.jQuery(sel)
      if ($btn.length && !$btn.hasClass('inactive') && !$btn.hasClass('WCTD_disabled')) {
        $btn.trigger('click')
        return true
      }
    }
  } catch(e) {}

  // Fallback : clic DOM natif
  try {
    const btn = win.document.querySelector(sel)
    if (btn && !btn.classList.contains('inactive') && !btn.classList.contains('WCTD_disabled') && !btn.disabled) {
      btn.click()
      return true
    }
  } catch(e) {}

  return false
}

export function continueCart(products, sel, onProgress) {
  const w = _cartWin
  if (!w || w.closed) { _running = false; onProgress && onProgress(0); return }

  ;(async () => {
    for (let i = 0; i < products.length; i++) {
      if (!_running) break
      onProgress(i)

      try { w.location.href = products[i].url } catch(e) { break }

      // Attendre page chargée + URL correcte
      let ready = false
      for (let t = 0; t < 40; t++) {
        await new Promise(r => setTimeout(r, 500))
        try {
          if (w.document.readyState === 'complete' && w.location.href.includes('TexteRecherche')) {
            ready = true; break
          }
        } catch(e) {}
      }
      if (!ready || !_running) { onProgress(i + 1); continue }

      // Attendre que le JS Leclerc finisse de rendre la page
      await new Promise(r => setTimeout(r, 2000))

      // Cliquer avec retry via jQuery
      let clicked = false
      for (let t = 0; t < 15; t++) {
        clicked = await clickBtn(w, sel)
        if (clicked) break
        await new Promise(r => setTimeout(r, 500))
      }

      // Attendre que l'ajout panier soit pris en compte
      await new Promise(r => setTimeout(r, 1500))

      onProgress(i + 1)
      await new Promise(r => setTimeout(r, 500))
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

  const w = window.open(homeUrl, '_cart_lec')
  if (!w) { _running = false; return }
  _cartWin = w

  window._cartQueue = products.map(p => ({ search: p.search, url: cfg.url(p.search) }))
  window._cartSel = CART_SEL[storeId] || '.aWCRS310_Add'
  window._cartOnProgress = onProgress

  onProgress(-1)
}
