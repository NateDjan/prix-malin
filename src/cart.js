// cart.js — passe la queue via window.name (persiste cross-navigation, cross-origin lisible)
// Un script autopilote est injecté dans l'onglet Leclerc par l'extension Claude

let _running = false
let _win = null

export function stopCart() {
  _running = false
  if (_win && !_win.closed) {
    try { _win.name = '' } catch(e) {}
  }
  _win = null
  localStorage.removeItem('pm_cart')
}

// Script autopilote injecté dans chaque page Leclerc
// Lit window.name, clique le bon bouton, navigue au suivant
export const AUTOPILOT_SCRIPT = `
(function() {
  if (!window.name || !window.name.startsWith('pm:')) return;
  try {
    var data = JSON.parse(window.name.slice(3));
    var queue = data.queue, idx = data.idx, total = data.total;
    if (idx >= total) { document.title = '✅ Panier complet'; return; }

    // Attendre que la page charge puis cliquer
    function clickBtn() {
      var li = document.querySelector('#ulListeProduits > li');
      var clicked = false;
      ['#ulListeProduits > li .aWCRS310_Add',
       '#ulListeProduits > li .aWCRS310_More'].forEach(function(sel) {
        if (clicked) return;
        var btn = document.querySelector(sel);
        if (!btn) return;
        var r = btn.getBoundingClientRect();
        if (r.width > 0) {
          // Essayer jQuery trigger d'abord
          if (window.jQuery) {
            window.jQuery(btn).trigger('click');
          } else {
            btn.click();
          }
          clicked = true;
        }
      });
      return clicked;
    }

    // Attendre 3s que la page soit prête, cliquer, puis passer au suivant
    var attempts = 0;
    var interval = setInterval(function() {
      attempts++;
      if (document.readyState === 'complete' && attempts >= 3) {
        clearInterval(interval);
        var ok = clickBtn();
        document.title = (ok ? '✅' : '⚠️') + ' ' + (idx+1) + '/' + total;

        // Mettre à jour idx et naviguer au suivant
        setTimeout(function() {
          data.idx = idx + 1;
          data.done = idx + 1;
          window.name = 'pm:' + JSON.stringify(data);
          if (idx + 1 < total) {
            window.location.href = queue[idx + 1].url;
          } else {
            window.name = 'pm:done';
            document.title = '✅ Panier complet!';
          }
        }, 1800);
      }
    }, 1000);
  } catch(e) { console.error('Autopilot error:', e); }
})();
`

export function startCart(storeId, products, driveConfig, onProgress) {
  if (_running) return
  _running = true
  const cfg = driveConfig[storeId]
  if (!cfg) { _running = false; return }

  // Dédupliquer
  const seen = new Set()
  const unique = products.filter(p => {
    if (seen.has(p.search)) return false
    seen.add(p.search)
    return true
  })

  const queue = unique.map(p => ({ search: p.search, url: cfg.url(p.search) }))
  const queueData = { queue, idx: 0, total: queue.length, done: 0 }

  // Stocker dans localStorage pour la progress bar
  localStorage.setItem('pm_cart', JSON.stringify({
    storeId, queue, total: queue.length, done: 0, status: 'waiting'
  }))

  // Ouvrir l'onglet et passer la queue via window.name
  const w = window.open('about:blank', '_cart_lec')
  if (!w) { _running = false; return }
  _win = w

  // Injecter les données AVANT la navigation (window.name cross-origin)
  w.name = 'pm:' + JSON.stringify(queueData)
  setTimeout(() => { w.location.href = queue[0].url }, 150)

  onProgress(0)

  // Poller window.name du tab Leclerc pour mettre à jour la progress bar
  ;(async () => {
    while (_running) {
      await new Promise(r => setTimeout(r, 800))
      try {
        if (!_win || _win.closed) { _running = false; break }
        const name = _win.name  // accessible cross-origin!
        if (!name || !name.startsWith('pm:')) continue
        if (name === 'pm:done') { onProgress(queue.length); _running = false; break }
        const data = JSON.parse(name.slice(3))
        const done = data.done || 0
        onProgress(done)
        // Sync localStorage pour compatibilité
        const lsData = JSON.parse(localStorage.getItem('pm_cart') || '{}')
        lsData.done = done
        localStorage.setItem('pm_cart', JSON.stringify(lsData))
        if (done >= queue.length) { _running = false; break }
      } catch(e) {}
    }
    _running = false
  })()
}
