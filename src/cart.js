
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

export function startCart(storeId, products, driveConfig, onProgress) {
  if (_running) return
  _running = true
  const cfg = driveConfig[storeId]
  if (!cfg) return
  const sel = CART_SEL[storeId] || '.aWCRS310_Add'

  // CRITIQUE : window.open SYNCHRONE ici, avant tout await
  // Ceci fonctionne car on est dans le handler du clic utilisateur
  const w = window.open(cfg.url(products[0].search), '_cart_lec')
  
  if (!w) {
    // Popup bloqué malgré les permissions
    // Fallback : ouvrir via location dans un iframe caché
    console.error('[PrixMalin] window.open bloqué')
    _running = false
    onProgress(0)
    return
  }

  onProgress(0)

  let _resolve = null
  const msgHandler = (e) => {
    if ((e.data === 'cart_done' || e.data === 'cart_timeout') && _resolve) _resolve(e.data)
  }
  window.addEventListener('message', msgHandler)

  ;(async () => {
    // Produit 0 : déjà ouvert via window.open synchrone
    // Injecter le bot quand la page charge
    async function injectBot(win, url) {
      // Attendre que la fenêtre soit accessible (about:blank → même origine)
      for (let t = 0; t < 5; t++) {
        try {
          if (win.document) break
        } catch(e) {}
        await new Promise(r => setTimeout(r, 200))
      }
      try {
        const code = 'var _s=' + JSON.stringify(sel) + ';' +
          'function _c(){var b=document.querySelector(_s);' +
          'if(!b){var all=document.querySelectorAll("a,button");' +
          'for(var k=0;k<all.length;k++){var t=(all[k].textContent+(all[k].getAttribute("aria-label")||"")).toLowerCase().trim();' +
          'if((t.includes("ajouter au panier")||t==="acheter")&&!all[k].disabled&&!all[k].classList.contains("inactive")){b=all[k];break;}}}' +
          'if(b&&!b.classList.contains("inactive")&&!b.classList.contains("WCTD_disabled")&&!b.disabled){b.click();try{window.opener.postMessage("cart_done","*")}catch(e){}return true}return false}' +
          'window.onload=function(){if(!_c()){var n=0,iv=setInterval(function(){if(_c()||++n>20){clearInterval(iv);if(n>20)try{window.opener.postMessage("cart_timeout","*")}catch(e){}},400)}};' +
          'window.location.href=' + JSON.stringify(url)
        const fn = new win.Function(code)
        fn()
        return true
      } catch(e) { return false }
    }

    await injectBot(w, cfg.url(products[0].search))
    await new Promise(r => { _resolve = r; setTimeout(() => r('timeout'), 15000) })
    _resolve = null
    onProgress(1)

    for (let i = 1; i < products.length; i++) {
      if (!_running) break
      onProgress(i)
      try { w.location.href = cfg.url(products[i].search) } catch(e) { break }
      await new Promise(r => { _resolve = r; setTimeout(() => r('timeout'), 15000) })
      _resolve = null
      onProgress(i + 1)
      await new Promise(r => setTimeout(r, 400))
    }

    window.removeEventListener('message', msgHandler)
    onProgress(products.length)
    _running = false
    try { w.close() } catch(e) {}
  })()
}
