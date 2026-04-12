// cart.js — stocke la queue dans localStorage, ouvre l'onglet Leclerc
// L'extension Claude pilote l'onglet avec de vrais clics physiques produit par produit
// et met à jour pm_cart.done après chaque clic réussi

let _running = false

export function stopCart() {
  _running = false
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

  // Stocker dans localStorage — l'extension le lit et le met à jour
  localStorage.setItem('pm_cart', JSON.stringify({
    storeId, queue, total: queue.length, done: 0, status: 'waiting'
  }))

  // Ouvrir le 1er produit dans l'onglet Leclerc
  const w = window.open(queue[0].url, '_cart_lec')
  if (!w) {
    const a = document.createElement('a')
    a.href = queue[0].url
    a.target = '_cart_lec'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  onProgress(0)

  // Poller pm_cart.done pour la progress bar
  ;(async () => {
    while (_running) {
      await new Promise(r => setTimeout(r, 700))
      try {
        const raw = localStorage.getItem('pm_cart')
        if (!raw) { _running = false; break }
        const data = JSON.parse(raw)
        onProgress(data.done || 0)
        if (data.status === 'done' || (data.done || 0) >= data.total) {
          _running = false; break
        }
      } catch(e) { break }
    }
    _running = false
  })()
}
