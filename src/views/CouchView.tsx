import { useState, useEffect } from 'react'
import LaziBot from '../components/LaziBot'

type CouchProps = { onGo: (view: string) => void }

const GAMES = [
  { id: 'supply-chain', title: 'Supply Chain Conquest', desc: 'Procurement · Sourcing · Logistics', icon: '📦', accent: '#0a66c2', picks: ['supply chain', 'procurement', 'sourcing', 'logistics', 'purchasing'] },
  { id: 'ops-command', title: 'Ops Command', desc: 'Operations Manager / Director', icon: '🎯', accent: '#057642', picks: ['operations manager', 'operations director', 'plant manager', 'production manager'] },
  { id: 'vendor-guild', title: 'Vendor Guild', desc: 'Category · Vendor · Contracts', icon: '🤝', accent: '#7c3aed', picks: ['category manager', 'vendor manager', 'contracts manager', 'strategic sourcing'] },
  { id: 'planning-arc', title: 'Planning Arc', desc: 'Demand · Inventory · Materials', icon: '📈', accent: '#b24020', picks: ['demand planning', 'inventory', 'materials management', 'supply planner', 'S&OP'] },
  { id: 'freight-run', title: 'Freight Run', desc: 'Freight · Distribution · Warehouse', icon: '🚚', accent: '#0e7490', picks: ['freight', 'distribution', 'warehouse', 'fulfillment'] },
  { id: 'erp-craft', title: 'ERP Craft', desc: 'SAP · Oracle · Workday', icon: '🧩', accent: '#1d4ed8', picks: ['erp', 'sap', 'oracle', 'workday', 'coupa', 'ariba'] },
]

interface Profile {
  id: string
  name: string
  headline: string
  summary: string
  years_exp: string
  skills: string[]
  targetTop: string[]
  targetMid: string[]
  targetEntry: string[]
  kwInclude: string[]
  kwExclude: string[]
  remoteKw: string[]
}

const EMPTY: Profile = { id: 'new', name: '', headline: '', summary: '', years_exp: '', skills: [], targetTop: [], targetMid: [], targetEntry: [], kwInclude: [], kwExclude: [], remoteKw: [] }

function slugify(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'profile' }
function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean)
  if (!p.length) return '?'
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase()
  return (p[0][0] + p[1][0]).toUpperCase()
}

function parseProfile(raw: string, fallbackId: string): Profile {
  const p: Profile = { ...EMPTY, id: fallbackId, skills: [], targetTop: [], targetMid: [], targetEntry: [], kwInclude: [], kwExclude: [], remoteKw: [] }
  try {
    const lines = raw.split('\n')
    let section: string | null = null
    let sub: string | null = null
    for (const line of lines) {
      if (!line.trim() || line.trim().startsWith('#') || line.trim() === '---') continue
      const indent = line.search(/\S/)
      if (indent === 0 && line.includes(':')) {
        const k = line.slice(0, line.indexOf(':')).trim()
        const v = line.slice(line.indexOf(':') + 1).trim().replace(/^["']|["']$/g, '')
        if (k === 'name') p.name = v
        else if (k === 'headline') p.headline = v
        else if (k === 'years_exp') p.years_exp = v
        else if (k === 'summary' && v && v !== '|') p.summary = v
        else if (k === 'active_profile') continue
        else if (k === 'target_roles') { section = 'target_roles'; sub = null; continue }
        else if (k === 'keywords') { section = 'keywords'; sub = null; continue }
        else if (k === 'remote_keywords') { section = 'remote'; continue }
        else if (k === 'skills') { section = 'skills'; continue }
        else { section = null; sub = null }
        if (k === 'summary' && v === '|' ) { section = 'summary'; continue }
      } else if (indent >= 2 && line.trim().startsWith('- ')) {
        const v = line.trim().slice(2).replace(/^["']|["']$/g, '')
        if (section === 'skills') p.skills.push(v)
        else if (section === 'remote') p.remoteKw.push(v)
        else if (section === 'target_roles' && sub === 'top') p.targetTop.push(v)
        else if (section === 'target_roles' && sub === 'mid') p.targetMid.push(v)
        else if (section === 'target_roles' && sub === 'entry') p.targetEntry.push(v)
        else if (section === 'keywords' && sub === 'include') p.kwInclude.push(v)
        else if (section === 'keywords' && sub === 'exclude') p.kwExclude.push(v)
      } else if (indent === 2 && line.trim().endsWith(':')) {
        const k = line.trim().slice(0, -1)
        if (section === 'target_roles' && ['top','mid','entry'].includes(k)) sub = k
        else if (section === 'keywords' && ['include','exclude'].includes(k)) sub = k
      } else if (section === 'summary' && indent >= 2) {
        p.summary += (p.summary ? '\n' : '') + line.trim()
      }
    }
  } catch {}
  return p
}

function toYaml(p: Profile): string {
  const esc = (s: string) => `"${s.replace(/"/g, '\\"')}"`
  const lines: string[] = ['---', `name: ${esc(p.name)}`, `headline: ${esc(p.headline)}`, `years_exp: ${p.years_exp || 0}`, 'summary: |']
  if (p.summary) for (const l of p.summary.split('\n')) lines.push(`  ${l}`); else lines.push('  ')
  lines.push('skills:'); if (p.skills.length) for (const s of p.skills) lines.push(`  - ${s}`); else lines.push('  []')
  lines.push('target_roles:'); lines.push('  top:'); if (p.targetTop.length) for (const s of p.targetTop) lines.push(`    - ${s}`); else lines.push('    []')
  lines.push('  mid:'); if (p.targetMid.length) for (const s of p.targetMid) lines.push(`    - ${s}`); else lines.push('    []')
  lines.push('  entry:'); if (p.targetEntry.length) for (const s of p.targetEntry) lines.push(`    - ${s}`); else lines.push('    []')
  lines.push('keywords:'); lines.push('  include:'); if (p.kwInclude.length) for (const s of p.kwInclude) lines.push(`    - ${s}`); else lines.push('    []')
  lines.push('  exclude:'); if (p.kwExclude.length) for (const s of p.kwExclude) lines.push(`    - ${s}`); else lines.push('    []')
  lines.push('remote_keywords:'); if (p.remoteKw.length) for (const s of p.remoteKw) lines.push(`  - ${s}`); else lines.push('  []')
  return lines.join('\n') + '\n'
}

export default function CouchView({ onGo }: CouchProps) {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [activeId, setActiveId] = useState('default')
  const [editing, setEditing] = useState<Profile | null>(null)
  const [skillIn, setSkillIn] = useState('')
  const [capTab, setCapTab] = useState<'skills' | 'roles' | 'keywords'>('skills')

  const loadAll = async () => {
    try {
      const main = await window.jobbot.fsRead('config/profile.yaml')
      const m = main.match(/active_profile:\s*(\S+)/)
      const active = m ? m[1].trim() : 'default'
      setActiveId(active)
      const entries = await window.jobbot.fsReadDir('config/profiles')
      const files = entries.filter(e => e.name.endsWith('.yaml')).map(e => e.name)
      const list: Profile[] = []
      for (const f of files) {
        try {
          const raw = await window.jobbot.fsRead(`config/profiles/${f}`)
          const id = f.replace('.yaml','')
          list.push(parseProfile(raw, id))
        } catch {}
      }
      // also include inline profile in profile.yaml if no file
      if (!list.find(p=>p.id===active)) {
        try { const p = parseProfile(main, active); if (p.name) list.push(p) } catch {}
      }
      if (list.length) setProfiles(list)
      else {
        // show empty state — nothing hardcoded
        setProfiles([])
      }
    } catch { setProfiles([]) }
  }

  useEffect(() => { loadAll() }, [])

  const activeProfile = profiles.find(p=>p.id===activeId) || profiles[0]
  const hasProfile = Boolean(activeProfile?.name)

  const parseResume = async () => {
    const paths = await window.jobbot.openFile([{ name: 'Resume', extensions: ['pdf', 'docx', 'txt'] }])
    if (!paths.length) return
    const res = await window.jobbot.pyRun('parser.py', [paths[0]])
    try {
      const data = JSON.parse(res.out)
      if (data.name) setEditing(prev => prev ? { ...prev, name: data.name } : prev)
      if (data.headline) setEditing(prev => prev ? { ...prev, headline: data.headline } : prev)
      if (data.years_exp) setEditing(prev => prev ? { ...prev, years_exp: data.years_exp } : prev)
      if (data.skills?.length) setEditing(prev => prev ? { ...prev, skills: Array.from(new Set([...(prev?.skills||[]), ...data.skills])) } as Profile : prev)
      if (data.summary) setEditing(prev => prev ? { ...prev, summary: data.summary.slice(0, 600) } : prev)
    } catch {}
  }

  const saveProfile = async (p: Profile) => {
    const id = slugify(p.name) || p.id
    const yaml = toYaml({ ...p, id })
    await window.jobbot.fsWrite(`config/profiles/${id}.yaml`, yaml)
    await window.jobbot.fsWrite('config/profiles/default.yaml', yaml)
    await window.jobbot.fsWrite('config/profile.yaml', `active_profile: ${id}\n`)
    setActiveId(id)
    await loadAll()
    setEditing(null)
  }

  const switchActive = async (id: string) => {
    await window.jobbot.fsWrite('config/profile.yaml', `active_profile: ${id}\n`)
    setActiveId(id)
  }

  return (
    <div>
      <div className="couch-hero">
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <LaziBot size={56} mood="chill" />
          <div style={{ flex: 1 }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>Welcome 2 The Couch <span className="couch-badge">Command Center</span></h2>
            <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.6 }}>
              This is <strong style={{ color: '#fff' }}>The Couch</strong> — where LaziBot lounges. Create profiles, pick a game, then hit <em>Run</em>. No hardcodes — everyone brings their own profile + resumes per site. Monastery of Laziness guide below.
            </p>
          </div>
        </div>
      </div>

      {/* Profiles area */}
      <div className="card card-couch">
        <div className="card-header">
          <div><div className="card-kicker">Profiles</div><h2>{profiles.length ? `${profiles.length} profile${profiles.length>1?'s':''} — active: ${activeProfile?.name || activeId}` : 'Create your first profile — nothing is hardcoded'}</h2></div>
          <button className="btn btn-primary btn-sm" onClick={() => setEditing({ ...EMPTY, id: `profile-${Date.now()}` })}>+ New profile</button>
        </div>

        {profiles.length > 1 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {profiles.map(p => (
              <button key={p.id} onClick={() => switchActive(p.id)} className={`btn btn-sm ${p.id===activeId ? 'btn-primary' : 'btn-secondary'}`} style={{ borderRadius: 999 }}>
                {initials(p.name)} {p.name || p.id} {p.id===activeId ? '●' : ''}
              </button>
            ))}
          </div>
        )}

        {!editing ? (
          hasProfile ? (
            <div>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0, background: 'linear-gradient(135deg, #0a66c2 0%, #004182 100%)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800 }}>{initials(activeProfile.name)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800 }}>{activeProfile.name} {activeProfile.headline ? `· ${activeProfile.headline}` : ''}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{activeProfile.summary ? activeProfile.summary.slice(0, 160) + (activeProfile.summary.length>160?'…':'') : 'Add a summary — scorers read this.'} {activeProfile.years_exp ? `· ${activeProfile.years_exp} yrs` : ''}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    {activeProfile.skills.slice(0,6).map(s=><span key={s} className="tag" style={{ fontSize: 11 }}>{s}</span>)}
                    {activeProfile.skills.length>6 && <span className="muted" style={{ fontSize: 11 }}>+{activeProfile.skills.length-6}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditing(activeProfile)}>Edit</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => onGo('attach')}>Resumes per site</button>
                  <button className="btn btn-primary btn-sm" onClick={() => onGo('search')}>Go to Search</button>
                </div>
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span className="muted" style={{ fontSize: 11 }}>Capabilities:</span>
                {activeProfile.targetTop.length > 0 && <span className="badge badge-blue">Top: {activeProfile.targetTop.slice(0,3).join(', ')}</span>}
                {activeProfile.kwInclude.length > 0 && <span className="badge badge-green">Include: {activeProfile.kwInclude.slice(0,3).join(', ')}</span>}
                {activeProfile.kwExclude.length > 0 && <span className="badge badge-red">Exclude: {activeProfile.kwExclude.slice(0,2).join(', ')}</span>}
                {!activeProfile.targetTop.length && !activeProfile.kwInclude.length && <span className="muted" style={{ fontSize: 11 }}>Add target roles + keywords in edit — scorers use them.</span>}
              </div>
            </div>
          ) : (
            <div style={{ background: '#0c1220', border: '1px dashed var(--border2)', borderRadius: 10, padding: 16, textAlign: 'center' }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>No profile yet — create one</div>
              <div className="muted" style={{ marginBottom: 12 }}>Each person on GitHub makes their own. Put your info, skills, and scoring hints here.</div>
              <button className="btn btn-primary" onClick={() => setEditing({ ...EMPTY, id: 'default' })}>Create profile</button>
            </div>
          )
        ) : (
          <div>
            <div className="grid-2">
              <div className="field"><label className="label">Name</label><input className="input" value={editing.name} placeholder="Your name" onChange={e=>setEditing({...editing, name: e.target.value})} /></div>
              <div className="field"><label className="label">Years</label><input className="input" value={editing.years_exp} placeholder="e.g. 8" onChange={e=>setEditing({...editing, years_exp: e.target.value})} /></div>
            </div>
            <div className="field"><label className="label">Headline</label><input className="input" value={editing.headline} placeholder="e.g. Senior PM — shipping 0→1" onChange={e=>setEditing({...editing, headline: e.target.value})} /></div>
            <div className="field"><label className="label">Summary</label><textarea className="textarea" value={editing.summary} placeholder="Who you are, what you do — scorers read this." onChange={e=>setEditing({...editing, summary: e.target.value})} /></div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 10, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
              {(['skills','roles','keywords'] as const).map(t=> (
                <button key={t} className={`btn btn-sm ${capTab===t?'btn-primary':'btn-secondary'}`} onClick={()=>setCapTab(t)}>{t === 'skills' ? 'Skills' : t === 'roles' ? 'Target Roles' : 'Keywords'}</button>
              ))}
            </div>

            {capTab === 'skills' && (
              <div className="field">
                <label className="label">Skills — drives matching (Enter to add)</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="input" value={skillIn} placeholder="e.g. Figma" onChange={e=>setSkillIn(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter'&&skillIn.trim()){ e.preventDefault(); if(!editing.skills.includes(skillIn.trim())) setEditing({...editing, skills:[...editing.skills, skillIn.trim()]}); setSkillIn('') }}} />
                  <button className="btn btn-secondary" onClick={()=>{ if(skillIn.trim()&&!editing.skills.includes(skillIn.trim())) setEditing({...editing, skills:[...editing.skills, skillIn.trim()]}); setSkillIn('') }}>Add</button>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>{editing.skills.map(s=><span key={s} className="tag">{s} <button className="tag-remove" onClick={()=>setEditing({...editing, skills: editing.skills.filter(x=>x!==s)})}>×</button></span>)}</div>
              </div>
            )}

            {capTab === 'roles' && (
              <div>
                <div className="field"><label className="label">Top roles (high bonus)</label><TagInput values={editing.targetTop} onChange={v=>setEditing({...editing, targetTop: v})} placeholder="e.g. senior product designer" /></div>
                <div className="field"><label className="label">Mid roles</label><TagInput values={editing.targetMid} onChange={v=>setEditing({...editing, targetMid: v})} placeholder="e.g. product designer" /></div>
                <div className="field"><label className="label">Entry roles</label><TagInput values={editing.targetEntry} onChange={v=>setEditing({...editing, targetEntry: v})} placeholder="e.g. junior designer" /></div>
                <div className="muted" style={{ fontSize: 11 }}>Top +40, Mid +28, Entry +15 in the scorer. Leave empty to use defaults + search keywords.</div>
              </div>
            )}

            {capTab === 'keywords' && (
              <div>
                <div className="field"><label className="label">Include keywords (boost score, +2 each up to +24)</label><TagInput values={editing.kwInclude} onChange={v=>setEditing({...editing, kwInclude: v})} placeholder="e.g. design system" /></div>
                <div className="field"><label className="label">Exclude keywords (auto-reject)</label><TagInput values={editing.kwExclude} onChange={v=>setEditing({...editing, kwExclude: v})} placeholder="e.g. sales manager" /></div>
                <div className="field"><label className="label">Remote keywords</label><TagInput values={editing.remoteKw} onChange={v=>setEditing({...editing, remoteKw: v})} placeholder="e.g. remote, work from home" /></div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12, alignItems: 'center' }}>
              <button className="btn btn-secondary btn-sm" onClick={parseResume}>📄 Parse Resume PDF → auto-fill</button>
              <div style={{ flex: 1 }} />
              <button className="btn btn-secondary btn-sm" onClick={()=>setEditing(null)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={()=>saveProfile(editing)}>Save profile</button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header"><div><div className="card-kicker">Game Selection</div><h2>Pick your run — LaziBot loads the right hunt</h2></div><span className="muted">6 games · loads keywords into Search</span></div>
        <div className="game-grid">
          {GAMES.map(g=>(
            <button key={g.id} className="game-card" onClick={async()=>{
              try{
                const raw=await window.jobbot.fsRead('config/search.yaml')
                const kwLines=g.picks.map(k=>`  - ${k}`).join('\n')
                let next: string
                if(raw.includes('keywords:')) next=raw.replace(/keywords:\n(?:  - .+\n?)+/, `keywords:\n${kwLines}\n`); else next=raw+`\nkeywords:\n${kwLines}\n`
                await window.jobbot.fsWrite('config/search.yaml', next); onGo('search')
              }catch{ onGo('search') }
            }} style={{ textAlign:'left' }}>
              <div className="game-card-icon" style={{ borderColor:g.accent, color:g.accent }}>{g.icon}</div>
              <h4>{g.title}</h4><p>{g.desc}</p><div className="muted" style={{ marginTop: 8, fontSize: 11 }}>{g.picks.slice(0,3).join(' · ')}</div>
            </button>
          ))}
        </div>
        <div className="walkthrough" style={{ marginTop: 12 }}><div className="walkthrough-dot">1</div><div><strong style={{ fontSize:12 }}>Walkthrough — Profile → Game → Search → Attach (resumes per site per profile) → Run → Report</strong><div className="muted" style={{ marginTop: 4, lineHeight: 1.6 }}>Create profile with capabilities (skills + target roles + keywords). Pick a game to prefill Search. In Attachments, upload up to 3 resumes per site — each site uses its own file when applying. LaziBot chat at bottom can set params or swap resumes.</div></div></div>
      </div>

      <div className="card" style={{ background:'linear-gradient(180deg, #0f172a 0%, #0b1220 100%)' }}>
        <h3>Monastery of Lazi-Bot</h3>
        <p className="muted" style={{ lineHeight: 1.7 }}>Fat, smudgy, no hard hat, no logo. He tapes <span className="mono">1 2 3 4</span> into OTP fields and stays on The Couch so you don't have to. Ask him below.</p>
      </div>
    </div>
  )
}

function TagInput({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[])=>void; placeholder: string }) {
  const [input, setInput] = useState('')
  const add = () => { const v=input.trim(); if(v&&!values.includes(v)){ onChange([...values, v]); setInput('') } }
  return (
    <div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="input" value={input} placeholder={placeholder} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); add() }}} />
        <button className="btn btn-secondary" onClick={add}>Add</button>
      </div>
      {values.length>0 && <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:8 }}>{values.map(s=><span key={s} className="tag">{s} <button className="tag-remove" onClick={()=>onChange(values.filter(x=>x!==s))}>×</button></span>)}</div>}
    </div>
  )
}
