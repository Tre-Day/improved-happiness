import { useState, useEffect } from 'react'

export default function QALibraryView({ onSave }: { onSave: (m: string) => void }) {
  const [profiles, setProfiles] = useState<{id:string,name:string}[]>([])
  const [active, setActive] = useState('default')
  const [items, setItems] = useState<{question:string,answer:string}[]>([])
  const [q, setQ] = useState('')
  const [a, setA] = useState('')

  useEffect(()=>{
    window.jobbot.fsRead('config/profile.yaml').then(y=>{
      const m=y.match(/active_profile:\s*(\S+)/)
      const act=m?m[1].trim():'default'
      setActive(act)
      window.jobbot.fsReadDir('config/profiles').then(entries=>{
        const ids=entries.filter(e=>e.name.endsWith('.qa.yaml')).map(e=>e.name.replace('.qa.yaml',''))
        const list=ids.map(id=>({id,name:id}))
        if(list.length) setProfiles(list)
        else setProfiles([{id:act, name:act}])
        load(act)
      }).catch(()=>load(act))
    }).catch(()=>load('default'))
  },[])

  const load = async (id:string)=>{
    setActive(id)
    try{
      const raw=await window.jobbot.fsRead(`config/profiles/${id}.qa.yaml`)
      const parsed=JSON.parse(raw)
      if(Array.isArray(parsed)) setItems(parsed)
    } catch{
      try{
        // try yaml fallback via direct read
        const raw2=await window.jobbot.fsRead(`config/profiles/${id}.qa.yaml`)
        setItems([])
      } catch{ setItems([]) }
    }
  }

  const save = async ()=>{
    await window.jobbot.fsWrite(`config/profiles/${active}.qa.yaml`, JSON.stringify(items, null, 2))
    onSave(`Q&A saved for ${active}`)
  }

  const add = ()=>{
    if(!q.trim()||!a.trim()) return
    setItems(prev=>[...prev, {question:q.trim(), answer:a.trim()}])
    setQ(''); setA('')
  }

  return (
    <div>
      <h1>Q&A Library — per profile</h1>
      <p className="muted">Screening answers auto-used by Playwright headless. Stored per profile <code>config/profiles/&lt;id&gt;.qa.yaml</code>. LaziBot also uses them.</p>
      <div style={{ display:'flex', gap:8, marginBottom:12 }}>
        <select className="select" style={{ maxWidth:220 }} value={active} onChange={e=>load(e.target.value)}>
          {profiles.map(p=> <option key={p.id} value={p.id}>{p.name}</option>)}
          {!profiles.find(p=>p.id===active) && <option value={active}>{active}</option>}
        </select>
        <button className="btn btn-secondary btn-sm" onClick={()=>load(active)}>Reload</button>
        <button className="btn btn-primary btn-sm" onClick={save}>Save</button>
      </div>
      <div className="card">
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div className="field" style={{ margin:0 }}><label className="label">Question contains</label><input className="input" value={q} placeholder="e.g. Are you authorized to work in the US?" onChange={e=>setQ(e.target.value)} /></div>
          <div className="field" style={{ margin:0 }}><label className="label">Answer</label><input className="input" value={a} placeholder="e.g. Yes — US citizen" onChange={e=>setA(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') add() }} /></div>
        </div>
        <button className="btn btn-secondary" style={{ marginTop:10 }} onClick={add}>Add Q&A</button>
      </div>
      <div className="card">
        <h3>Saved ({items.length})</h3>
        {items.length===0 ? <span className="muted">No entries yet — add above. Generic fallbacks: salary, sponsorship, remote, years.</span> :
          items.map((it,i)=>(
            <div key={i} style={{ display:'flex', gap:8, alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
              <span style={{ flex:1, fontSize:12 }}><strong>{it.question}</strong> → {it.answer}</span>
              <button className="btn btn-ghost btn-sm" onClick={()=>setItems(prev=>prev.filter((_,idx)=>idx!==i))}>×</button>
            </div>
          ))}
      </div>
    </div>
  )
}
