import { useState, useRef, useCallback } from 'react'
import { startCart, stopCart, continueCart } from './cart.js'

const STORES = [
  { id: 'leclerc',     name: 'E.Leclerc',   letter: 'E', color: '#0052CC', factor: 1.00 },
  { id: 'carrefour',   name: 'Carrefour',    letter: 'C', color: '#003DA5', factor: 1.08 },
  { id: 'intermarche', name: 'Intermarché',  letter: 'I', color: '#E31E24', factor: 1.04 },
  { id: 'lidl',        name: 'Lidl',         letter: 'L', color: '#FFC61E', factor: 0.95, cheap: true },
  { id: 'auchan',      name: 'Auchan',       letter: 'A', color: '#E31E24', factor: 1.06 },
  { id: 'monoprix',    name: 'Monoprix',     letter: 'M', color: '#E63946', factor: 1.22 },
]

const CART_SEL = {
  leclerc:     '.aWCRS310_Add',
  carrefour:   'button[aria-label*="Ajouter le produit"]',
  intermarche: '.add-to-cart-button',
  auchan:      '.add-to-cart',
  monoprix:    '.btn-addtocart',
  lidl:        '.m-button--primary',
}

const SYS = 'Tu es un assistant qui extrait des produits de tickets de caisse. Reponds UNIQUEMENT avec du JSON valide, sans markdown, sans explication.'
const FP = 'Lis TOUS les produits et prix de ce ticket sans en oublier aucun. IMPORTANT: price = prix TOTAL de la ligne, qty = toujours 1. JSON uniquement:\n{"products":[{"original":"texte brut","search":"nom normalise","qty":1,"price":0.00}],"store":"enseigne ou vide","total":0.00,"date":"JJ/MM/AAAA ou vide"}'

async function callProxy(messages) {
  const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ system: SYS, messages }) })
  const d = await r.json()
  if (!r.ok || d.error) throw new Error(d.error || 'Erreur API')
  const m = (d.text || '').match(/\{[\s\S]*\}/)
  if (!m) throw new Error('Réponse invalide')
  return JSON.parse(m[0])
}

async function analyzeText(text) {
  const lines = text.trim().split('\n').filter(l => l.trim())
  if (lines.length <= 50) return callProxy([{ role: 'user', content: 'Extrait TOUS les produits.\n\n' + text + '\n\n' + FP }])
  const third = Math.floor(lines.length / 3)
  const [r1, r2, r3] = await Promise.all([
    callProxy([{ role: 'user', content: lines.slice(0, third).join('\n') + '\n\n' + FP }]),
    callProxy([{ role: 'user', content: lines.slice(third, third * 2).join('\n') + '\n\n' + FP }]),
    callProxy([{ role: 'user', content: lines.slice(third * 2).join('\n') + '\n\n' + FP }])
  ])
  return { products: [...(r1.products||[]),...(r2.products||[]),...(r3.products||[])], store: r1.store||r2.store||r3.store||'', total: r1.total||r2.total||r3.total||0, date: r1.date||r2.date||r3.date||'' }
}

async function analyzeImage(b64, mediaType) {
  return callProxy([{ role: 'user', content: [{ type: 'image_url', image_url: { url: `data:${mediaType};base64,${b64}` } }, { type: 'text', text: 'Lis TOUS les produits. ' + FP }] }])
}

async function fetchRealPrices(products, cp) {
  const prices = {}
  await Promise.all([...products].sort((a,b)=>(b.price||0)-(a.price||0)).slice(0,5).map(async p => {
    try { const d = await fetch(`/api/prix?q=${encodeURIComponent(p.search)}&cp=${encodeURIComponent(cp)}`).then(r=>r.json()); if(d.prices) prices[p.search]=d.prices } catch {}
  }))
  return prices
}

function getRealPrice(search, storeId, realPrices) {
  const key = Object.keys(realPrices).find(k => k===search||k.toLowerCase()===search.toLowerCase()||search.toLowerCase().startsWith(k.toLowerCase().split(' ').slice(0,2).join(' '))||k.toLowerCase().startsWith(search.toLowerCase().split(' ').slice(0,2).join(' ')))
  if (!key) return null
  const v = realPrices[key]?.[storeId]
  return typeof v==='number'?v:typeof v==='string'?parseFloat(v):null
}

function calcStoreTotal(products, storeId, realPrices) {
  let total=0, realCount=0
  products.forEach(p => { const rp=getRealPrice(p.search,storeId,realPrices); if(rp!=null){total+=rp;realCount++}else{const s=STORES.find(x=>x.id===storeId);total+=(p.price||0)*(s?.factor||1)} })
  return { total: +total.toFixed(2), realCount, totalCount: products.length }
}

function ecoTotal(products, realPrices) {
  return +products.reduce((sum,p)=>{ let best=(p.price||0)*Math.min(...STORES.map(s=>s.factor)); STORES.forEach(s=>{const rp=getRealPrice(p.search,s.id,realPrices);if(rp!=null)best=Math.min(best,rp)}); return sum+best }, 0).toFixed(2)
}

// Cart logic is in src/cart.js
const DRIVE = {
  leclerc:     { note: 'Connecte-toi sur Leclerc Drive avant de démarrer', url: q => `https://fd3-courses.leclercdrive.fr/magasin-169203-169203-Rueil-Malmaison-Boulevard-National/recherche.aspx?TexteRecherche=${encodeURIComponent(q)}` },
  carrefour:   { note: 'Connecte-toi sur carrefour.fr avant de démarrer',   url: q => `https://www.carrefour.fr/s?q=${encodeURIComponent(q)}&ref=search` },
  intermarche: { note: 'Connecte-toi sur intermarche.com avant de démarrer', url: q => `https://www.intermarche.com/recherche?q=${encodeURIComponent(q)}` },
  auchan:      { note: 'Connecte-toi sur auchan.fr avant de démarrer',      url: q => `https://www.auchan.fr/recherche?q=${encodeURIComponent(q)}` },
  monoprix:    { note: 'Connecte-toi sur monoprix.fr avant de démarrer',    url: q => `https://www.monoprix.fr/recherche/${encodeURIComponent(q)}` },
  lidl:        { note: 'Disponible sur lidl.fr',                            url: q => `https://www.lidl.fr/recherche?q=${encodeURIComponent(q)}` },
}

function ProgressBar({ products, cur, storeName, onClose, onContinue }) {
  if (cur === null) return null
  // État -1 = attente connexion utilisateur
  if (cur === -1) return (
    <div className="prog-bar" style={{background:'rgba(91,245,168,0.08)',border:'1px solid rgba(91,245,168,0.4)',borderRadius:12,padding:'12px 16px',margin:'16px 0',display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
      <span style={{fontSize:20}}>🔐</span>
      <span style={{flex:1,fontSize:13,color:'rgba(240,237,232,0.8)'}}>
        Connecte-toi sur <b>{storeName}</b> dans l'onglet qui vient de s'ouvrir, puis clique <b>Continuer</b>
      </span>
      <button onClick={onContinue} style={{background:'#5BF5A8',color:'#0A0A0F',border:'none',borderRadius:8,padding:'8px 16px',fontWeight:700,cursor:'pointer',fontSize:13}}>
        ✅ Continuer
      </button>
      <button onClick={onClose} style={{background:'transparent',color:'rgba(240,237,232,0.5)',border:'1px solid rgba(255,255,255,0.15)',borderRadius:8,padding:'8px 12px',cursor:'pointer',fontSize:13}}>
        Annuler
      </button>
    </div>
  )
  const done = cur >= products.length
  const pct = done ? 100 : Math.round(cur / products.length * 100)

function ImportView({ onAnalyze, loading, error }) {
  const [text, setText] = useState('')
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef()
  const handleFile = useCallback(async file => {
    const ext = file.name.split('.').pop().toLowerCase()
    if (ext==='pdf') {
      try {
        const buf = await file.arrayBuffer()
        const pdfjsLib = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs')
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs'
        const pdf = await pdfjsLib.getDocument({data:buf}).promise
        const page = await pdf.getPage(1)
        const vp = page.getViewport({scale:2.0})
        const canvas = document.createElement('canvas')
        canvas.width=vp.width; canvas.height=vp.height
        await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise
        onAnalyze(null, canvas.toDataURL('image/jpeg',0.85).split(',')[1], 'image/jpeg')
      } catch { const r=new FileReader(); r.onload=e=>onAnalyze(null,e.target.result.split(',')[1],'image/jpeg'); r.readAsDataURL(file) }
    } else if (['jpg','jpeg','png','webp'].includes(ext)) {
      const r=new FileReader(); r.onload=e=>onAnalyze(null,e.target.result.split(',')[1],file.type); r.readAsDataURL(file)
    } else { const t=await file.text(); onAnalyze(t) }
  }, [onAnalyze])
  return (<>
    <div className={`drop-zone ${dragging?'over':''}`} onClick={()=>fileRef.current?.click()} onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);if(e.dataTransfer.files[0])handleFile(e.dataTransfer.files[0])}}>
      <div style={{fontSize:36,marginBottom:10}}>🧾</div>
      <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>Importer un ticket</div>
      <div style={{fontSize:12,color:'rgba(240,237,232,.4)'}}>PDF · JPG · PNG · TXT — glisse ou clique</div>
      <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.csv" style={{display:'none'}} onChange={e=>e.target.files[0]&&handleFile(e.target.files[0])}/>
    </div>
    <div className="sep">— ou colle le texte —</div>
    <div className="paste-row">
      <textarea placeholder="Colle le texte de ton ticket ici..." value={text} onChange={e=>setText(e.target.value)}/>
      <button className="btn-analyse" disabled={loading||text.trim().length<5} onClick={()=>onAnalyze(text)}>⚡ Analyser</button>
    </div>
    {error && <div className="err">⚠️ {error}</div>}
  </>)
}

function CompareView({ result, realPrices, cp, onSetCp, onFetchPrices }) {
  const [store, setStore] = useState(null)
  const [cpInput, setCpInput] = useState('')
  const [cartProgress, setCartProgress] = useState(null)
  const { products, store: storeName, total, date } = result
  const base = products.reduce((a,p)=>a+(p.price||0),0)
  const ecoAmt = ecoTotal(products, realPrices)
  const hasReal = Object.keys(realPrices).length>0
  const currentStore = store&&store!=='ecomix'?STORES.find(x=>x.id===store):null
  return (<>
    <div className="ticket-info">
      <div><div className="ticket-store">{storeName||'Ticket'}</div><div className="ticket-meta">{date?`Le ${date} · `:''}{products.length} articles</div></div>
      <div className="ticket-total">{(total||base).toFixed(2)} €</div>
    </div>
    <div className="sec-title">CHOISIR UNE ENSEIGNE</div>
    {hasReal&&<div className="real-badge">✓ Prix réels disponibles</div>}
    <div className={`ecomix ${store==='ecomix'?'sel':''}`} onClick={()=>setStore('ecomix')}>
      <div style={{display:'flex',alignItems:'center',gap:12}}><div style={{fontSize:28}}>🌿</div><div><div className="em-name">Eco-Mix</div><div className="em-sub">Chaque produit chez le moins cher</div></div></div>
      <div style={{textAlign:'right'}}><div className="em-amt">{ecoAmt} €</div><div className="em-save">-{(base-parseFloat(ecoAmt)).toFixed(2)} € éco.</div></div>
    </div>
    <div className="stores-grid">
      {STORES.map(s=>{ const ct=calcStoreTotal(products,s.id,realPrices); return (
        <div key={s.id} className={`store-card ${store===s.id?'sel':''}`} onClick={()=>setStore(s.id)}>
          {s.cheap&&<div className="cheap-badge">LE + BAS</div>}
          <div className="store-icon" style={{background:s.color+'22',color:s.color}}>{s.letter}</div>
          <div className="store-name">{s.name}</div>
          <div className="store-price" style={{color:s.color}}>{ct.total.toFixed(2)} €</div>
          <div className={`store-lbl ${ct.realCount>0?'real':''}`}>{ct.realCount>0?`${ct.realCount}/${ct.totalCount} réels`:'estimation'}</div>
        </div>
      )})}
    </div>
    {store&&store!=='ecomix'&&currentStore&&(<div>
      <div className="notice"><div className="notice-title">🔐 Avant de démarrer</div><div className="notice-sub">{DRIVE[store]?.note}</div></div>
      <button className="btn-cart" style={{background:currentStore.color}} onClick={()=>{setCartProgress(0);startCart(store,products,DRIVE,cur=>setCartProgress(cur))}}>
        🛒 Remplir panier {currentStore.name} ({products.length} produits)
      </button>
      <div className="products">{products.map((p,i)=>{ const rp=getRealPrice(p.search,store,realPrices); return (<div key={i} className="product"><div><div className="p-name">{p.search}</div><div className="p-orig">{p.original}</div></div><div className={`p-price ${rp!=null?'real':''}`}>{rp!=null?rp.toFixed(2):(p.price||0).toFixed(2)} €</div></div>) })}</div>
    </div>)}
    {store==='ecomix'&&(()=>{ const bestS=STORES.reduce((a,b)=>a.factor<b.factor?a:b); return (<div>
      <div className="notice"><div className="notice-title">🌿 Eco-Mix</div><div className="notice-sub">Chaque produit dans l&apos;enseigne la moins chère.</div></div>
      <button className="btn-cart" style={{background:'linear-gradient(135deg,#5BF5A8,#00C97A)',color:'#0A0A0F'}} onClick={()=>{setCartProgress(0);startCart(bestS.id,products,DRIVE,cur=>setCartProgress(cur))}}>
        🛒 Remplir panier Eco-Mix ({products.length} produits)
      </button>
      <div className="products">{products.map((p,i)=>{ const rp=getRealPrice(p.search,bestS.id,realPrices); return (<div key={i} className="product"><div><div className="p-name">{p.search}</div><div className="p-orig">{p.original}</div></div><div className={`p-price ${rp!=null?'real':''}`}>{rp!=null?rp.toFixed(2):(p.price||0).toFixed(2)} €</div></div>) })}</div>
    </div>) })()}
    {!cp&&(<div className="cp-box"><div className="cp-label">📍 Code postal pour les vrais prix</div><div className="cp-row"><input className="cp-input" type="text" placeholder="Ex: 92410" maxLength={5} value={cpInput} onChange={e=>setCpInput(e.target.value)}/><button className="cp-btn" onClick={()=>{if(cpInput.length>=4){onSetCp(cpInput);onFetchPrices(products,cpInput)}}}>OK</button></div></div>)}
    {cartProgress!==null&&(()=>{ const s=store&&store!=='ecomix'?STORES.find(x=>x.id===store):STORES.reduce((a,b)=>a.factor<b.factor?a:b); return <ProgressBar products={products} cur={cartProgress} storeName={s?.name||''} onClose={()=>{stopCart();setCartProgress(null)}} onContinue={() => continueCart(window._cartQueue, window._cartSel, cur => setCartProgress(cur))}/> })()}
  </>)
}

export default function App() {
  const [sec, setSec] = useState('import')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [realPrices, setRealPrices] = useState({})
  const [cp, setCp] = useState(()=>localStorage.getItem('prix_malin_cp')||'')
  const handleAnalyze = useCallback(async (text, b64, mediaType) => {
    setLoading(true); setError(''); setSec('compare')
    try {
      const res = b64&&mediaType ? await analyzeImage(b64,mediaType) : text ? await analyzeText(text) : (() => { throw new Error('Format non supporté') })()
      if (!res.products?.length) throw new Error('Aucun produit trouvé')
      setResult(res); setLoading(false)
      const cpVal = cp||localStorage.getItem('prix_malin_cp')||''
      if (cpVal) fetchRealPrices(res.products,cpVal).then(rp=>{ if(Object.keys(rp).length>0) setRealPrices(prev=>({...prev,...rp})) })
    } catch(e) { setError(e.message); setLoading(false); setSec('import') }
  }, [cp])
  return (<div className="app">
    <h1>Prix Malin 🛒</h1>
    <div className="sub">Compare les prix · Économise partout</div>
    <div className="sec-tabs">
      <button className={`sec-btn ${sec==='import'?'active':''}`} onClick={()=>setSec('import')}>📥 Importer</button>
      <button className={`sec-btn ${sec==='compare'&&result?'active':''}`} disabled={!result} onClick={()=>result&&setSec('compare')}>🔍 Comparer</button>
    </div>
    {loading?(<div className="spinner"><div className="spin">⏳</div><div style={{fontSize:14,fontWeight:700,marginBottom:4}}>Analyse en cours...</div><div style={{fontSize:12,color:'rgba(240,237,232,.4)'}}>Quelques secondes...</div></div>)
    :sec==='import'||!result?(<ImportView onAnalyze={handleAnalyze} loading={loading} error={error}/>)
    :(<CompareView result={result} realPrices={realPrices} cp={cp} onSetCp={val=>{setCp(val);localStorage.setItem('prix_malin_cp',val)}} onFetchPrices={(prods,cpVal)=>fetchRealPrices(prods,cpVal).then(rp=>{if(Object.keys(rp).length>0)setRealPrices(prev=>({...prev,...rp}))})}/>)}
  </div>)
}