
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

  // IMPORTANT: window.open doit être appelé SYNCHRONEMENT depuis le handler du clic
  // sinon Chrome le bloque. On l'ouvre ici, avant tout await.
  const w = window.open(cfg.url(products[0].search), '_cart_pm')
  
  if (!w) {
    // Popup bloqué - fallback: naviguer dans l'onglet actuel via un lien
    alert('Autorise les popups pour prix-malin.vercel.app dans Chrome (icône cadenas en haut)')
    _running = false
    return
  }

  ;(async () => {
    onProgress(0)
    
    let resolveMsg = null
    const msgHandler = (e) => {
      if ((e.data === 'cart_done' || e.data === 'cart_timeout') && resolveMsg) {
        resolveMsg(e.data)
      }
    }
    window.addEventListener('message', msgHandler)

    // Injecter le bot dans la fenêtre ouverte (about:blank → même origine)
    async function injectAndNavigate(win, url) {
      try {
        const botCode = [
          'var sel=' + JSON.stringify(sel) + ';',
          'var targetUrl=' + JSON.stringify(url) + ';',
          'function tryClick(){',
          '  var b=document.querySelector(sel);',
          '  if(!b){var all=document.querySelectorAll("a,button");for(var k=0;k<all.length;k++){var t=(all[k].textContent+(all[k].getAttribute("aria-label")||"")).toLowerCase().trim();if((t.includes("ajouter au panier")||t==="acheter")&&!all[k].disabled&&!all[k].classList.contains("inactive")){b=all[k];break;}}}',
          '  if(b&&!b.classList.contains("inactive")&&!b.classList.contains("WCTD_disabled")&&!b.disabled){b.click();try{window.opener&&window.opener.postMessage("cart_done","*");}catch(e){}return true;}',
          '  return false;',
          '}',
          'window.onload=function(){if(!tryClick()){var n=0,iv=setInterval(function(){if(tryClick()||++n>20){clearInterval(iv);if(n>20)try{window.opener&&window.opener.postMessage("cart_timeout","*");}catch(e){}},400);}};',
          'window.location.href=targetUrl;',
        ].join('')
        
        if (win.document && win.document.readyState !== undefined) {
          const fn = new win.Function(botCode)
          fn()
          return true
        }
      } catch(e) {}
      return false
    }

    // Produit 0 - la fenêtre vient d'ouvrir about:blank
    await new Promise(r => setTimeout(r, 500))
    await injectAndNavigate(w, cfg.url(products[0].search))
    
    await new Promise(r => {
      resolveMsg = r
      setTimeout(() => r('timeout'), 15000)
    })
    resolveMsg = null
    onProgress(1)

    // Produits suivants - réutiliser la même fenêtre
    for (let i = 1; i < products.length; i++) {
      if (!_running) break
      await new Promise(r => setTimeout(r, 800))
      onProgress(i)
      
      try {
        // Naviguer dans la fenêtre existante
        w.location.href = cfg.url(products[i].search)
      } catch(e) {
        break
      }
      
      // Attendre le chargement et le clic automatique
      await new Promise(r => {
        resolveMsg = r
        setTimeout(() => r('timeout'), 15000)
      })
      resolveMsg = null
      onProgress(i + 1)
    }

    window.removeEventListener('message', msgHandler)
    onProgress(products.length)
    _running = false
    try { w.close() } catch(e) {}
  })()
}
