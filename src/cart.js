
export const CART_SEL = {
  leclerc: '.aWCRS310_Add',
  carrefour: 'button[aria-label*="Ajouter le produit"]',
  intermarche: '.add-to-cart-button',
  auchan: '.add-to-cart',
  monoprix: '.btn-addtocart',
  lidl: '.m-button--primary',
}

let _running = false
let _win = null

export function stopCart() {
  _running = false
  try { if (_win && !_win.closed) _win.close() } catch(e) {}
  _win = null
}

// Attendre que la fenêtre soit sur la bonne URL (avec TexteRecherche)
async function waitForPage(win, expectedUrl, timeoutMs = 15000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 400))
    try {
      if (win.closed) return false
      const url = win.location.href
      const ready = win.document.readyState === 'complete'
      if (ready && url.includes('TexteRecherche')) return true
    } catch(e) {}
  }
  return false
}

// Cliquer le bouton panier avec retries
async function clickAddToCart(win, sel) {
  for (let t = 0; t < 20; t++) {
    try {
      const btn = win.document.querySelector(sel)
      if (btn && !btn.classList.contains('inactive') && !btn.classList.contains('WCTD_disabled') && !btn.disabled) {
        btn.click()
        return true
      }
      // Fallback texte
      const all = win.document.querySelectorAll('a,button')
      for (const b of all) {
        const txt = (b.textContent + (b.getAttribute('aria-label')||'')).toLowerCase().trim()
        if ((txt.includes('ajouter au panier') || txt === 'acheter') && !b.disabled && !b.classList.contains('inactive')) {
          b.click()
          return true
        }
      }
    } catch(e) {}
    await new Promise(r => setTimeout(r, 400))
  }
  return false
}

// Appelée quand l'utilisateur clique "Continuer" après s'être connecté
export function continueCart(queue, sel, onProgress) {
  if (!_win || _win.closed) { return }
  _running = true

  ;(async () => {
    for (let i = 0; i < queue.length; i++) {
      if (!_running) break
      onProgress(i)

      const { url } = queue[i]
      
      // Naviguer
      try { _win.location.href = url } catch(e) { break }

      // Attendre la page produit
      const ok = await waitForPage(_win, url)
      if (!ok || _win.closed) { onProgress(i); continue }

      // Délai supplémentaire pour le JS Leclerc
      await new Promise(r => setTimeout(r, 1000))

      // Cliquer
      const clicked = await clickAddToCart(_win, sel)
      console.log('[Cart] produit', i+1, clicked ? 'ajouté' : 'ÉCHEC')

      onProgress(i + 1)
      await new Promise(r => setTimeout(r, 800))
    }

    onProgress(queue.length)
    _running = false
    try { _win.close() } catch(e) {}
    _win = null
  })()
}

export function startCart(storeId, products, driveConfig, onProgress) {
  if (_running) return
  const cfg = driveConfig[storeId]
  if (!cfg) return

  const sel = CART_SEL[storeId] || '.aWCRS310_Add'
  const queue = products.map(p => ({ search: p.search, url: cfg.url(p.search) }))

  // Ouvrir la page d'accueil du drive (pas de recherche) pour que les cookies soient là
  const homeUrls = {
    leclerc: 'https://fd3-courses.leclercdrive.fr/magasin-169203-169203-Rueil-Malmaison-Boulevard-National/default.aspx',
  }
  const openUrl = homeUrls[storeId] || queue[0].url

  const w = window.open(openUrl, '_cart_pm')
  if (!w) { onProgress(null); return }
  
  _win = w
  window._cartQueue = queue
  window._cartSel = sel

  // Signaler l'état "attente connexion" (cur = -1)
  onProgress(-1)
}
