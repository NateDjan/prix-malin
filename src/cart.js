// cart.js — ouvre l'onglet Leclerc, stocke la queue dans window.name
// L'extension Claude injecte le script autopilote après chaque chargement de page

let _running = false
let _win = null

export function stopCart() {
  _running = false
  _win = null
  localStorage.removeItem('pm_cart')
}

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

  // Stocker dans localStorage pour la progress bar
  localStorage.setItem('pm_cart', JSON.stringify({
    storeId, queue, total: queue.length, done: 0, status: 'running'
  }))

  // Ouvrir DIRECTEMENT sur le 1er produit — pas de about:blank
  const w = window.open(queue[0].url, '_cart_lec')
  _win = w

  // Exposer sur window pour que l'extension puisse lire la queue
  window._pmCart = { queue, total: queue.length }

  onProgress(0)

  // Poller localStorage.done pour la progress bar
  ;(async () => {
    while (_running) {
      await new Promise(r => setTimeout(r, 700))
      try {
        const raw = localStorage.getItem('pm_cart')
        if (!raw) { _running = false; break }
        const data = JSON.parse(raw)
        onProgress(data.done || 0)
        if ((data.done || 0) >= data.total || data.status === 'done') {
          _running = false; break
        }
      } catch(e) { break }
    }
    _running = false
  })()
}
