import { useState, useRef, useCallback, useEffect } from 'react'
import { startCart, stopCart } from './cart.js'

// ═══ Historique localStorage ═══
function getHistory() { try { return JSON.parse(localStorage.getItem('pm_history') || '[]') } catch { return [] } }
function saveToHistory(result, name) {
  const h = getHistory()
  const entry = { id: Date.now(), name: name || result.store || 'Ticket ' + (h.length + 1), result, date: new Date().toLocaleDateString('fr-FR'), productCount: result.products?.length || 0 }
  h.unshift(entry)
  if (h.length > 20) h.pop()
  localStorage.setItem('pm_history', JSON.stringify(h))
  return entry
}
function deleteFromHistory(id) { const h = getHistory().filter(e => e.id !== id); localStorage.setItem('pm_history', JSON.stringify(h)) }
function renameInHistory(id, name) { const h = getHistory(); const e = h.find(x => x.id === id); if (e) e.name = name; localStorage.setItem('pm_history', JSON.stringify(h)) }

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
const FP = 'Lis TOUS les produits et prix de ce ticket. IMPORTANT: price = prix TOTAL de la ligne, qty = toujours 1. Le champ search = nom du produit pour recherche en supermarché : inclure la MARQUE + le NOM COMPLET du produit (ex: "Nutella pâte à tartiner", "Président beurre doux", "Lactel lait demi-écrémé", "Mutti double concentré de tomate"). NE JAMAIS inclure : le grammage, le poids, la quantité, les codes, ni les noms de RAYONS ou CATEGORIES (pas de "épicerie", "crèmerie", "boisson", "frais", "surgelé", etc). Uniquement marque + type de produit. JSON uniquement:\n{"products":[{"original":"texte brut du ticket","search":"marque + nom produit","qty":1,"price":0.00}],"store":"enseigne ou vide","total":0.00,"date":"JJ/MM/AAAA ou vide"}'

async function callProxy(messages) {
  const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ system: SYS, messages }) })
  const d = await r.json()
  if (!r.ok || d.error) throw new Error(d.error || 'Erreur API')
  let text = d.text || ''
  // Supprimer tout ce qui précède le 1er { et suit le dernier }
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('Réponse invalide du modèle')
  text = text.slice(start, end + 1)
  try { return JSON.parse(text) }
  catch(e) {
    // Tentative de réparation : supprimer les caractères de contrôle
    text = text.replace(/[\x00-\x1F\x7F]/g, ' ').replace(/,\s*([}\]])/g, '$1')
    try { return JSON.parse(text) }
    catch(e2) { throw new Error('JSON invalide : ' + e2.message.slice(0,60)) }
  }
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
  // Fetch ALL products in batches of 8 for speed
  const batches = []
  for (let i = 0; i < products.length; i += 8) batches.push(products.slice(i, i + 8))
  for (const batch of batches) {
    await Promise.all(batch.map(async p => {
      try { const d = await fetch(`/api/prix?q=${encodeURIComponent(p.search)}&cp=${encodeURIComponent(cp)}`).then(r=>r.json()); if(d.prices) prices[p.search]=d.prices } catch {}
    }))
  }
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

// Eco+ : prix le plus bas possible par produit (qualité moindre acceptée)
function ecoPlusTotal(products) {
  const cheapest = STORES.reduce((a,b)=>a.factor<b.factor?a:b)
  return +(products.reduce((sum,p)=>sum+(p.price||0)*cheapest.factor, 0)).toFixed(2)
}

// Ouvrir en fenêtre côte à côte (moitié droite de l'écran)
function openSplit(url) {
  const w = Math.floor(screen.width / 2)
  const h = screen.height
  window.open(url, 'prix_malin_drive', `width=${w},height=${h},left=${w},top=0`)
}

// Cart logic is in src/cart.js
const DRIVE = {
  leclerc:     { note: 'Connecte-toi sur Leclerc Drive avant de démarrer', url: q => `https://fd3-courses.leclercdrive.fr/magasin-169203-169203-Rueil-Malmaison-Boulevard-National/recherche.aspx?TexteRecherche=${encodeURIComponent(q)}` },
  carrefour:   { note: 'Connecte-toi sur carrefour.fr avant de démarrer',   url: q => `https://www.carrefour.fr/s?q=${encodeURIComponent(q)}&ref=search` },
  intermarche: { note: 'Sélectionne ton magasin sur intermarche.com avant de démarrer', url: q => `https://www.intermarche.com/recherche/${encodeURIComponent(q)}` },
  auchan:      { note: 'Sélectionne ton drive sur auchan.fr avant de démarrer', url: q => `https://www.auchan.fr/recherche?text=${encodeURIComponent(q)}` },
  monoprix:    { note: 'Connecte-toi sur courses.monoprix.fr avant de démarrer', url: q => `https://courses.monoprix.fr/search?q=${encodeURIComponent(q)}` },
  lidl:        { note: 'Connecte-toi sur lidl.fr avant de démarrer', url: q => `https://www.lidl.fr/q/search?q=${encodeURIComponent(q)}` },
}

const CART_URLS = {
  leclerc: 'https://fd3-courses.leclercdrive.fr/magasin-169203-169203-Rueil-Malmaison-Boulevard-National/mon-panier.aspx',
  carrefour: 'https://www.carrefour.fr/mon-panier',
  intermarche: 'https://www.intermarche.com/panier',
  auchan: 'https://www.auchan.fr/panier',
  monoprix: 'https://courses.monoprix.fr/cart',
  lidl: 'https://www.lidl.fr/'
}

function ProgressBar({ total, cur, storeName, onClose }) {
  if (cur === null) return null
  const done = cur >= total
  const pct = total > 0 ? (done ? 100 : Math.round(cur / total * 100)) : 0
  const prodName = ''
  return (
    <div className="prog-bar" style={{background:'rgba(255,255,255,0.05)',borderRadius:12,padding:'12px 16px',margin:'16px 0'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
        <span style={{fontSize:13,fontWeight:700,color:'#5BF5A8'}}>
          🛒 {cur}/{total} · {storeName}
        </span>
        <button onClick={onClose} style={{background:'transparent',border:'none',color:'rgba(240,237,232,0.4)',cursor:'pointer',fontSize:12}}>Annuler</button>
      </div>
      {prodName && <div style={{fontSize:12,color:'rgba(240,237,232,0.5)',marginBottom:6}}>📦 {prodName}</div>}
      <div style={{background:'rgba(255,255,255,0.1)',borderRadius:4,height:6}}>
        <div style={{background:'#5BF5A8',height:6,borderRadius:4,width:pct+'%',transition:'width 0.5s'}}/>
      </div>
      {done && <div style={{fontSize:12,color:'#5BF5A8',marginTop:6,textAlign:'center'}}>✅ Panier rempli !</div>}
    </div>
  )
}

function ImportView({ onAnalyze, onLoadHistory, loading, error }) {
  const [text, setText] = useState('')
  const [dragging, setDragging] = useState(false)
  const [history, setHistory] = useState(getHistory)
  const [editId, setEditId] = useState(null)
  const [editName, setEditName] = useState('')
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
    {history.length>0&&(<>
      <div className="sec-title" style={{marginTop:20}}>📋 HISTORIQUE</div>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {history.map(h=>(
          <div key={h.id} style={{background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.08)',borderRadius:12,padding:'10px 14px',display:'flex',alignItems:'center',gap:10}}>
            {editId===h.id?(
              <div style={{flex:1,display:'flex',gap:6}}>
                <input type="text" value={editName} onChange={e=>setEditName(e.target.value)} style={{flex:1,background:'rgba(255,255,255,.08)',border:'1px solid rgba(91,245,168,.3)',borderRadius:8,padding:'4px 8px',color:'#F0EDE8',fontSize:12,outline:'none',fontFamily:'inherit'}} autoFocus onKeyDown={e=>{if(e.key==='Enter'){renameInHistory(h.id,editName);setEditId(null);setHistory(getHistory())}}}/>
                <button onClick={()=>{renameInHistory(h.id,editName);setEditId(null);setHistory(getHistory())}} style={{background:'#5BF5A8',color:'#0A0A0F',border:'none',borderRadius:8,padding:'4px 10px',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>OK</button>
              </div>
            ):(
              <>
                <div style={{flex:1,cursor:'pointer'}} onClick={()=>onLoadHistory(h)}>
                  <div style={{fontSize:13,fontWeight:700,color:'#F0EDE8'}}>{h.name}</div>
                  <div style={{fontSize:11,color:'rgba(240,237,232,.4)'}}>{h.date} · {h.productCount} articles</div>
                </div>
                <button onClick={e=>{e.stopPropagation();setEditId(h.id);setEditName(h.name)}} style={{background:'none',border:'none',color:'rgba(240,237,232,.3)',cursor:'pointer',fontSize:14}} title="Renommer">✏️</button>
                <button onClick={e=>{e.stopPropagation();deleteFromHistory(h.id);setHistory(getHistory())}} style={{background:'none',border:'none',color:'rgba(255,80,80,.4)',cursor:'pointer',fontSize:14}} title="Supprimer">🗑️</button>
              </>
            )}
          </div>
        ))}
      </div>
    </>)}
  </>)
}

function CompareView({ result, realPrices, cp, onSetCp, onFetchPrices }) {
  const [store, setStore] = useState(null)
  const [cpInput, setCpInput] = useState('')
  const [cartProgress, setCartProgress] = useState(null)
  const [cartTotal, setCartTotal] = useState(0)
  const [opened, setOpened] = useState(()=>{try{return JSON.parse(localStorage.getItem('pm_opened')||'{}')}catch{return{}}})
  const markOpen = (sid,i) => { const o={...opened,[sid+'_'+i]:true}; setOpened(o); localStorage.setItem('pm_opened',JSON.stringify(o)) }
  const isOpen = (sid,i) => !!opened[sid+'_'+i]
  const resetOpen = () => { setOpened({}); localStorage.removeItem('pm_opened') }
  const { products, store: storeName, total, date } = result
  const base = products.reduce((a,p)=>a+(p.price||0),0)
  const ecoAmt = ecoTotal(products, realPrices)
  const hasReal = Object.keys(realPrices).length>0
  const currentStore = store&&store!=='ecomix'&&store!=='ecoplus'?STORES.find(x=>x.id===store):null
  const uniqueCount = [...new Set(products.map(p=>p.search))].length
  const ecoPlusAmt = ecoPlusTotal(products)
  const cheapestStore = STORES.reduce((a,b)=>a.factor<b.factor?a:b)
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
    <div className={`ecomix ${store==='ecoplus'?'sel':''}`} onClick={()=>setStore('ecoplus')} style={{borderColor:'rgba(254,200,30,.25)',background:store==='ecoplus'?'rgba(254,200,30,.15)':'rgba(254,200,30,.05)'}}>
      <div style={{display:'flex',alignItems:'center',gap:12}}><div style={{fontSize:28}}>💰</div><div><div className="em-name" style={{color:'#FEC81E'}}>Eco+</div><div className="em-sub">Tout chez {cheapestStore.name} (le moins cher)</div></div></div>
      <div style={{textAlign:'right'}}><div className="em-amt" style={{color:'#FEC81E'}}>{ecoPlusAmt} €</div><div className="em-save" style={{color:'rgba(254,200,30,.7)'}}>-{(base-ecoPlusAmt).toFixed(2)} € vs ticket</div></div>
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
    {store&&store!=='ecomix'&&store!=='ecoplus'&&currentStore&&(<div>
      <div className="notice"><div className="notice-title">🔐 {currentStore.name}</div><div className="notice-sub">{DRIVE[store]?.note}<br/>Clique <strong style={{color:'#5BF5A8'}}>Ouvrir</strong> pour ajouter au panier. <em style={{color:'rgba(240,237,232,.35)'}}>Astuce : glisse l'onglet sur le côté pour voir les deux en même temps.</em></div></div>
      {(()=>{const cnt=products.filter((_,i)=>isOpen(store,i)).length; return cnt>0?(<div style={{display:'flex',gap:8,marginBottom:10}}>
        <div style={{flex:1,background:'rgba(91,245,168,.1)',borderRadius:10,padding:'10px 14px',textAlign:'center'}}><span style={{color:'#5BF5A8',fontWeight:800,fontSize:14}}>{cnt}/{products.length}</span><div style={{fontSize:11,color:'rgba(240,237,232,.4)'}}>ouverts</div></div>
        <a href={CART_URLS[store]||'#'} target="_blank" rel="noopener noreferrer" style={{flex:1,background:currentStore.color,borderRadius:10,padding:'10px 14px',textAlign:'center',textDecoration:'none',color:'#fff',fontWeight:800,fontSize:13,display:'flex',alignItems:'center',justifyContent:'center'}}>🛒 Voir mon panier ↗</a>
      </div>):null})()}
      {(()=>{const cnt=products.filter((_,i)=>isOpen(store,i)).length; return cnt>0?<button onClick={resetOpen} style={{background:'none',border:'none',color:'rgba(240,237,232,.3)',fontSize:11,cursor:'pointer',marginBottom:8,fontFamily:'inherit'}}>Réinitialiser les coches</button>:null})()}
      <div className="products">{products.map((p,i)=>{ const rp=getRealPrice(p.search,store,realPrices); const done=isOpen(store,i); const url=DRIVE[store]?.url(p.search)||'#'; return (<div key={i} className="product" style={done?{opacity:.5}:{}}>
        <div style={{flex:1,minWidth:0}}><div className="p-name">{done?'✅ ':''}{p.search}</div><div className="p-orig">{p.original}</div></div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <div className={`p-price ${rp!=null?'real':''}`}>{rp!=null?rp.toFixed(2):(p.price||0).toFixed(2)} €</div>
          <a href={url} target="_blank" rel="noopener noreferrer" onClick={(e)=>{e.preventDefault();markOpen(store,i);openSplit(url)}} style={{background:done?'rgba(91,245,168,.15)':currentStore.color,color:done?'#5BF5A8':'#fff',padding:'6px 10px',borderRadius:8,fontSize:11,fontWeight:700,textDecoration:'none',whiteSpace:'nowrap',cursor:'pointer'}}>{done?'✅':'🔗 Ouvrir'}</a>
        </div>
      </div>) })}</div>
    </div>)}
    {store==='ecoplus'&&(()=>{ const cfg=DRIVE[cheapestStore.id]; return (<div>
      <div className="notice" style={{borderColor:'rgba(254,200,30,.3)',background:'rgba(254,200,30,.05)'}}><div className="notice-title" style={{color:'#FEC81E'}}>💰 Eco+ · {cheapestStore.name}</div><div className="notice-sub">Tous les produits au prix {cheapestStore.name}.<br/><strong style={{color:'#FEC81E'}}>Économie vs ticket : {((total||base)-ecoPlusAmt).toFixed(2)} €</strong></div></div>
      {(()=>{const cnt=products.filter((_,i)=>isOpen(cheapestStore.id+'_eco',i)).length; return cnt>0?(<div style={{display:'flex',gap:8,marginBottom:10}}>
        <div style={{flex:1,background:'rgba(254,200,30,.1)',borderRadius:10,padding:'10px 14px',textAlign:'center'}}><span style={{color:'#FEC81E',fontWeight:800,fontSize:14}}>{cnt}/{products.length}</span><div style={{fontSize:11,color:'rgba(240,237,232,.4)'}}>ouverts</div></div>
        <a href={CART_URLS[cheapestStore.id]||'#'} target="_blank" rel="noopener noreferrer" style={{flex:1,background:'#FEC81E',borderRadius:10,padding:'10px 14px',textAlign:'center',textDecoration:'none',color:'#0A0A0F',fontWeight:800,fontSize:13,display:'flex',alignItems:'center',justifyContent:'center'}}>🛒 Voir mon panier ↗</a>
      </div>):null})()}
      <div className="products">{products.map((p,i)=>{ const done=isOpen(cheapestStore.id+'_eco',i); const url=cfg?.url(p.search)||'#'; const ecoPrice=((p.price||0)*cheapestStore.factor); return (<div key={i} className="product" style={done?{opacity:.5}:{}}>
        <div style={{flex:1,minWidth:0}}><div className="p-name">{done?'✅ ':''}{p.search}</div><div className="p-orig">{p.original}</div></div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <div className="p-price" style={{color:'#FEC81E'}}>{ecoPrice.toFixed(2)} €</div>
          <a href={url} target="_blank" rel="noopener noreferrer" onClick={(e)=>{e.preventDefault();markOpen(cheapestStore.id+'_eco',i);openSplit(url)}} style={{background:done?'rgba(254,200,30,.15)':cheapestStore.color,color:done?'#FEC81E':'#0A0A0F',padding:'6px 10px',borderRadius:8,fontSize:11,fontWeight:700,textDecoration:'none',whiteSpace:'nowrap',cursor:'pointer'}}>{done?'✅':'🔗 Ouvrir'}</a>
        </div>
      </div>) })}</div>
    </div>) })()}
    {store==='ecomix'&&(()=>{ const bestS=STORES.reduce((a,b)=>a.factor<b.factor?a:b); const cfg=DRIVE[bestS.id]; return (<div>
      <div className="notice"><div className="notice-title">🌿 Eco-Mix · {bestS.name}</div><div className="notice-sub">Clique <strong style={{color:'#5BF5A8'}}>Ouvrir</strong> pour ajouter au panier. <em style={{color:'rgba(240,237,232,.35)'}}>Astuce : glisse l'onglet sur le côté pour voir les deux.</em></div></div>
      {(()=>{const cnt=products.filter((_,i)=>isOpen(bestS.id,i)).length; return cnt>0?(<div style={{display:'flex',gap:8,marginBottom:10}}>
        <div style={{flex:1,background:'rgba(91,245,168,.1)',borderRadius:10,padding:'10px 14px',textAlign:'center'}}><span style={{color:'#5BF5A8',fontWeight:800,fontSize:14}}>{cnt}/{products.length}</span><div style={{fontSize:11,color:'rgba(240,237,232,.4)'}}>ouverts</div></div>
        <a href={CART_URLS[bestS.id]||'#'} target="_blank" rel="noopener noreferrer" style={{flex:1,background:'#5BF5A8',borderRadius:10,padding:'10px 14px',textAlign:'center',textDecoration:'none',color:'#0A0A0F',fontWeight:800,fontSize:13,display:'flex',alignItems:'center',justifyContent:'center'}}>🛒 Voir mon panier ↗</a>
      </div>):null})()}
      {(()=>{const cnt=products.filter((_,i)=>isOpen(bestS.id,i)).length; return cnt>0?<button onClick={resetOpen} style={{background:'none',border:'none',color:'rgba(240,237,232,.3)',fontSize:11,cursor:'pointer',marginBottom:8,fontFamily:'inherit'}}>Réinitialiser les coches</button>:null})()}
      <div className="products">{products.map((p,i)=>{ const rp=getRealPrice(p.search,bestS.id,realPrices); const done=isOpen(bestS.id,i); const url=cfg?.url(p.search)||'#'; return (<div key={i} className="product" style={done?{opacity:.5}:{}}>
        <div style={{flex:1,minWidth:0}}><div className="p-name">{done?'✅ ':''}{p.search}</div><div className="p-orig">{p.original}</div></div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <div className={`p-price ${rp!=null?'real':''}`}>{rp!=null?rp.toFixed(2):(p.price||0).toFixed(2)} €</div>
          <a href={url} target="_blank" rel="noopener noreferrer" onClick={(e)=>{e.preventDefault();markOpen(bestS.id,i);openSplit(url)}} style={{background:done?'rgba(91,245,168,.15)':bestS.color,color:done?'#5BF5A8':'#fff',padding:'6px 10px',borderRadius:8,fontSize:11,fontWeight:700,textDecoration:'none',whiteSpace:'nowrap',cursor:'pointer'}}>{done?'✅':'🔗 Ouvrir'}</a>
        </div>
      </div>) })}</div>
    </div>) })()}
    {!cp&&(<div className="cp-box"><div className="cp-label">📍 Code postal pour les vrais prix</div><div className="cp-row"><input className="cp-input" type="text" placeholder="Ex: 92410" maxLength={5} value={cpInput} onChange={e=>setCpInput(e.target.value)}/><button className="cp-btn" onClick={()=>{if(cpInput.length>=4){onSetCp(cpInput);onFetchPrices(products,cpInput)}}}>OK</button></div></div>)}
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
      // Auto-save to history
      saveToHistory(res)
      const cpVal = cp||localStorage.getItem('prix_malin_cp')||''
      if (cpVal) fetchRealPrices(res.products,cpVal).then(rp=>{ if(Object.keys(rp).length>0) setRealPrices(prev=>({...prev,...rp})) })
    } catch(e) { setError(e.message); setLoading(false); setSec('import') }
  }, [cp])
  const handleLoadHistory = useCallback((entry) => {
    setResult(entry.result); setSec('compare'); setError('')
    const cpVal = cp||localStorage.getItem('prix_malin_cp')||''
    if (cpVal && entry.result?.products) fetchRealPrices(entry.result.products,cpVal).then(rp=>{ if(Object.keys(rp).length>0) setRealPrices(prev=>({...prev,...rp})) })
  }, [cp])
  return (<div className="app">
    <h1>Prix Malin 🛒</h1>
    <div className="sub">Compare les prix · Économise partout</div>
    <div className="sec-tabs">
      <button className={`sec-btn ${sec==='import'?'active':''}`} onClick={()=>setSec('import')}>📥 Importer</button>
      <button className={`sec-btn ${sec==='compare'&&result?'active':''}`} disabled={!result} onClick={()=>result&&setSec('compare')}>🔍 Comparer</button>
    </div>
    {loading?(<div className="spinner"><div className="spin">⏳</div><div style={{fontSize:14,fontWeight:700,marginBottom:4}}>Analyse en cours...</div><div style={{fontSize:12,color:'rgba(240,237,232,.4)'}}>Quelques secondes...</div></div>)
    :sec==='import'||!result?(<ImportView onAnalyze={handleAnalyze} onLoadHistory={handleLoadHistory} loading={loading} error={error}/>)
    :(<CompareView result={result} realPrices={realPrices} cp={cp} onSetCp={val=>{setCp(val);localStorage.setItem('prix_malin_cp',val)}} onFetchPrices={(prods,cpVal)=>fetchRealPrices(prods,cpVal).then(rp=>{if(Object.keys(rp).length>0)setRealPrices(prev=>({...prev,...rp}))})}/>)}
  </div>)
}