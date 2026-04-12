
export const CART_SEL = {
  leclerc:     '.aWCRS310_Add',
  carrefour:   'button[aria-label*="Ajouter le produit"]',
  intermarche: '.add-to-cart-button',
  auchan:      '.add-to-cart',
  monoprix:    '.btn-addtocart',
  lidl:        '.m-button--primary',
}

let _running = false

function clickBtn(doc, sel) {
  // Essayer le sélecteur spécifique
  let btn = doc.querySelector(sel)
  if (btn && !btn.classList.contains('inactive') && !btn.classList.contains('WCTD_disabled') && !btn.disabled) {
    btn.click()
    return true
  }
  // Fallback universel
  const all = doc.querySelectorAll('a,button')
  for (let j = 0; j < all.length; j++) {
    const t = (all[j].textContent + (all[j].getAttribute('aria-label') || '')).toLowerCase().trim()
    if ((t.includes('ajouter au panier') || t === 'acheter') && !all[j].disabled && !all[j].classList.contains('inactive')) {
      all[j].click()
      return true
    }
  }
  return false
}

export function stopCart() { _running = false }

export function startCart(storeId, products, driveConfig, onProgress) {
  if (_running) return
  _running = true
  const cfg = driveConfig[storeId]
  if (!cfg) return
  const sel = CART_SEL[storeId] || '.aWCRS310_Add'

  ;(async () => {
    let w = null
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

      // Ouvrir une page vide — même origine, on peut lui écrire dessus
      if (!w || w.closed) {
        w = window.open('about:blank', '_cart_pm')
      }

      // Injecter le bot via w.document (fonctionne car about:blank = même origine)
      try {
        const botFn = new w.Function(
          'sel', 'url', 'opener',
          [
            'function tryClick() {',
            '  var b = document.querySelector(sel);',
            '  if (!b) {',
            '    var els = document.querySelectorAll("a,button");',
            '    for (var k=0; k<els.length; k++) {',
            '      var t = (els[k].textContent + (els[k].getAttribute("aria-label")||"")).toLowerCase().trim();',
            '      if ((t.includes("ajouter au panier") || t === "acheter") && !els[k].disabled && !els[k].classList.contains("inactive")) { b = els[k]; break; }',
            '    }',
            '  }',
            '  if (b && !b.classList.contains("inactive") && !b.classList.contains("WCTD_disabled") && !b.disabled) {',
            '    b.click();',
            '    try { opener.postMessage("cart_done", "*"); } catch(e) {}',
            '    return true;',
            '  }',
            '  return false;',
            '}',
            'window.onload = function() {',
            '  if (!tryClick()) {',
            '    var n=0; var iv = setInterval(function() {',
            '      if (tryClick() || ++n > 20) {',
            '        clearInterval(iv);',
            '        if (n > 20) try { opener.postMessage("cart_timeout", "*"); } catch(e) {}',
            '      }',
            '    }, 400);',
            '  }',
            '};',
            'window.location.href = url;',
          ].join('\n')
        )
        botFn(sel, url, window)
      } catch(e) {
        // Si new Function échoue, naviguer directement
        w.location.href = url
        await new Promise(r => setTimeout(r, 5000))
        try { clickBtn(w.document, sel) } catch(e2) {}
        onProgress(i + 1)
        await new Promise(r => setTimeout(r, 600))
        continue
      }

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
    try { w && w.close() } catch(e) {}
  })()
}
