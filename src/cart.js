
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

function openViaLink(url, target) {
  // Ouvrir via un vrai lien <a> — contourne le popup blocker
  const a = document.createElement('a')
  a.href = url
  a.target = target || '_cart_pm'
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Retourner une référence window via name
  return window.open('', target || '_cart_pm')
}

export function startCart(storeId, products, driveConfig, onProgress) {
  if (_running) return
  _running = true
  const cfg = driveConfig[storeId]
  if (!cfg) return
  const sel = CART_SEL[storeId] || '.aWCRS310_Add'
  const winName = '_cart_leclerc'

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

      if (i === 0) {
        // Premier produit : ouvrir via lien <a> avec target nommé
        const a = document.createElement('a')
        a.href = url
        a.target = winName
        a.rel = 'noopener'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      } else {
        // Produits suivants : référencer la même fenêtre par son nom
        const w = window.open('', winName)
        if (w && !w.closed) {
          w.location.href = url
        } else {
          // Fenêtre fermée, réouvrir
          const a = document.createElement('a')
          a.href = url
          a.target = winName
          a.rel = 'noopener'
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
        }
      }

      // Attendre postMessage cart_done (max 15s)
      await new Promise(r => {
        resolveMsg = r
        setTimeout(() => r('timeout'), 15000)
      })
      resolveMsg = null
      await new Promise(r => setTimeout(r, 500))
    }

    window.removeEventListener('message', msgHandler)
    onProgress(products.length)
    _running = false
  })()
}
