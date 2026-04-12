
export const CART_SEL = {
  leclerc:     '.aWCRS310_Add',
  carrefour:   'button[aria-label*="Ajouter le produit"]',
  intermarche: '.add-to-cart-button',
  auchan:      '.add-to-cart',
  monoprix:    '.btn-addtocart',
  lidl:        '.m-button--primary',
}

// Construit le HTML d'une page bot qui navigue vers url et clique sel
export function buildBotHtml(url, sel) {
  const script = [
    'var url="' + url.replace(/"/g, '\\"') + '";',
    'var sel="' + sel.replace(/"/g, '\\"') + '";',
    'function tryClick(){',
    '  var b=document.querySelector(sel);',
    '  if(!b){var all=document.querySelectorAll("a,button");for(var j=0;j<all.length;j++){var t=(all[j].textContent+(all[j].getAttribute("aria-label")||"")).toLowerCase().trim();if((t.includes("ajouter au panier")||t==="acheter")&&!all[j].disabled&&!all[j].classList.contains("inactive")){b=all[j];break;}}}',
    '  if(b&&!b.classList.contains("inactive")&&!b.classList.contains("WCTD_disabled")&&!b.disabled){b.click();try{window.opener.postMessage("done","*");}catch(e){}return true;}',
    '  return false;',
    '}',
    'window.onload=function(){if(!tryClick()){var n=0,iv=setInterval(function(){if(tryClick()||++n>20){clearInterval(iv);if(n>20)try{window.opener.postMessage("timeout","*");}catch(e){}},400)}};',
    'window.location.href=url;',
  ].join('');
  return '<html><head></head><body>' + '<' + 'script>' + script + '</' + 'script></body></html>';
}

let _cartRunning = false;

export function startCart(storeId, products, driveConfig, onProgress) {
  if (_cartRunning) return;
  _cartRunning = true;
  const cfg = driveConfig[storeId];
  if (!cfg) return;
  const sel = CART_SEL[storeId] || '.aWCRS310_Add';

  (async () => {
    let w = null;
    let _resolve = null;

    const handler = (e) => {
      if ((e.data === 'done' || e.data === 'timeout') && _resolve) {
        _resolve(e.data);
      }
    };
    window.addEventListener('message', handler);

    for (let i = 0; i < products.length; i++) {
      if (!_cartRunning) break;
      onProgress(i);
      const url = cfg.url(products[i].search);
      const html = buildBotHtml(url, sel);

      if (!w || w.closed) {
        w = window.open('about:blank', '_leclerc');
      }

      try {
        w.document.open();
        w.document.write(html);
        w.document.close();
      } catch(e) {
        try { w.close(); } catch(e2) {}
        w = window.open('about:blank', '_leclerc');
        try { w.document.open(); w.document.write(html); w.document.close(); } catch(e3) {}
      }

      // Attendre postMessage (max 15s)
      await new Promise(r => {
        _resolve = r;
        setTimeout(() => r('timeout'), 15000);
      });
      _resolve = null;
      await new Promise(r => setTimeout(r, 600));
    }

    window.removeEventListener('message', handler);
    onProgress(products.length);
    _cartRunning = false;
    try { if (w) w.close(); } catch(e) {}
  })();
}

export function stopCart() {
  _cartRunning = false;
}
