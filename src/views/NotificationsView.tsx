import { useState, useEffect } from 'react'

export default function NotificationsView({ onSave }: { onSave: (m: string) => void }) {
  const [hooks, setHooks] = useState<{url:string, enabled:boolean, label:string}[]>([])
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')

  useEffect(()=>{
    window.jobbot.fsRead('config/notifications.yaml').then(y=>{
      try{
        // simple yaml parse for webhooks
        const lines=y.split('\n')
        const list: any[]=[]
        let cur:any=null
        for(const line of lines){
          if(line.trim().startsWith('- url:')){ cur={url: line.split('url:')[1].trim().replace(/^["']|["']$/g,''), enabled:true, label:''}; list.push(cur) }
          else if(line.trim().startsWith('label:') && cur) cur.label=line.split('label:')[1].trim().replace(/^["']|["']$/g,'')
          else if(line.trim().startsWith('enabled:') && cur) cur.enabled=line.includes('true')
        }
        if(list.length) setHooks(list)
      } catch{}
    }).catch(()=>{})
  },[])

  const save = async ()=>{
    const yaml = ['webhooks:'].concat(hooks.map(h=> `  - url: "${h.url}"\n    label: "${h.label}"\n    enabled: ${h.enabled}`)).join('\n')+'\n'
    await window.jobbot.fsWrite('config/notifications.yaml', yaml)
    onSave('Notifications saved')
  }

  const add = ()=>{
    if(!url.trim()) return
    setHooks(prev=>[...prev, {url:url.trim(), label:label.trim()||'Webhook', enabled:true}])
    setUrl(''); setLabel('')
  }

  const test = async (u:string)=>{
    try{
      const res=await fetch(u, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({event:'test', msg:'JobBot test notification — LaziBot says hi'}) })
      onSave(res.ok? `Test sent to ${u}` : `Test failed ${res.status}`)
    } catch(e){ onSave(`Test failed: ${String(e).slice(0,80)}`) }
  }

  return (
    <div>
      <h1>Notifications</h1>
      <p className="muted">Discord/Telegram/generic webhooks fired on apply complete. Stored in <code>config/notifications.yaml</code>. Testable.</p>
      <div className="card">
        <div style={{ display:'grid', gridTemplateColumns:'1fr 180px 100px', gap:8 }}>
          <input className="input" value={url} placeholder="https://discord.com/api/webhooks/... or https://api.telegram.org/bot..." onChange={e=>setUrl(e.target.value)} />
          <input className="input" value={label} placeholder="Label" onChange={e=>setLabel(e.target.value)} />
          <button className="btn btn-primary" onClick={add}>Add</button>
        </div>
      </div>
      <div className="card">
        <h3>Webhooks ({hooks.length})</h3>
        {hooks.length===0 ? <span className="muted">None yet — add a webhook URL above and Test.</span> :
          hooks.map((h,i)=>(
            <div key={i} style={{ display:'flex', gap:8, alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
              <input type="checkbox" checked={h.enabled} onChange={e=>setHooks(prev=>prev.map((x,idx)=>idx===i?{...x, enabled:e.target.checked}:x))} />
              <span style={{ flex:1, fontSize:12, overflow:'hidden', textOverflow:'ellipsis' }}><strong>{h.label}</strong> — {h.url.slice(0,60)}</span>
              <button className="btn btn-secondary btn-sm" onClick={()=>test(h.url)}>Test</button>
              <button className="btn btn-ghost btn-sm" onClick={()=>setHooks(prev=>prev.filter((_,idx)=>idx!==i))}>×</button>
            </div>
          ))}
        <button className="btn btn-primary" style={{ marginTop:12 }} onClick={save}>Save</button>
      </div>
    </div>
  )
}
