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
  if (!cfg) { _running = false; return }
  const sel = CART_SEL[storeId] || '.aWCRS310_Add'

  // window.open SYNCHRONE — on est dans le handler du clic, avant tout await
  const url0 = cfg.url(products[0].search)
  const w = window.open(url0, '_cart_pm')

  if (!w) {
    // Popup bloqué — écrire dans localStorage pour le bot bookmarklet
    const queue = products.map(p => ({ search: p.search, url: cfg.url(p.search) }))
    localStorage.setItem('pm_cart', JSON.stringify({
      storeId, sel, queue, total: queue.length, current: 0, done: 0, ts: Date.now()
    }))
    onProgress(0)
    ;(async () => {
      while (_running) {
        await new Promise(r => setTimeout(r, 600))
        try {
          const data = JSON.parse(localStorage.getItem('pm_cart') || '{}')
          if (!data.queue) break
          onProgress(data.done || 0)
          if ((data.done || 0) >= data.total) break
        } catch(e) { break }
      }
      onProgress(products.length)
      _running = false
      localStorage.removeItem('pm_cart')
    })()
    return
  }

  // Popup ouvert — injecter le bot via new Function, postMessage pour sync
  onProgress(0)
  let _resolve = null
  const msgHandler = (e) => {
    if ((e.data === 'cart_done' || e.data === 'cart_timeout') && _resolve) _resolve(e.data)
  }
  window.addEventListener('message', msgHandler)

  ;(async () => {
    async function injectBot(win, url) {
      await new Promise(r => setTimeout(r, 300))
      try {
        const code =
          'var _s=' + JSON.stringify(sel) + ';' +
          'var _u=' + JSON.stringify(url) + ';' +
          'function _c(){' +
          '  var b=document.querySelector(_s);' +
          '  if(!b){var all=document.querySelectorAll("a,button");for(var k=0;k<all.length;k++){var t=(all[k].textContent+(all[k].getAttribute("aria-label")||"")).toLowerCase().trim();if((t.includes("ajouter au panier")||t==="acheter")&&!all[k].disabled&&!all[k].classList.contains("inactive")){b=all[k];break;}}}' +
          '  if(b&&!b.classList.contains("inactive")&&!b.classList.contains("WCTD_disabled")&&!b.disabled){b.click();try{window.opener.postMessage("cart_done","*");}catch(e){}return true;}return false;' +
          '}' +
          'window.onload=function(){if(!_c()){var n=0,iv=setInterval(function(){if(_c()||++n>25){clearInterval(iv);if(n>25)try{window.opener.postMessage("cart_timeout","*");}catch(e){}},400);}};' +
          'window.location.href=_u;'
        new win.Function(code)()
        return true
      } catch(e) { return false }
    }

    await injectBot(w, url0)
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
