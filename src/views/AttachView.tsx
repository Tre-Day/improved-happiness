import { useState, useEffect } from 'react'

interface SiteAttachment {
  siteId: string
  siteName: string
  resumes: string[]
  cover: string
  portfolio: string
  linkedinUrl: string
}

const DEFAULT_SITES: SiteAttachment[] = [
  { siteId: 'linkedin',       siteName: 'LinkedIn',       resumes: [], cover: '', portfolio: '', linkedinUrl: '' },
  { siteId: 'greenhouse',     siteName: 'Greenhouse',     resumes: [], cover: '', portfolio: '', linkedinUrl: '' },
  { siteId: 'workday',        siteName: 'Workday',        resumes: [], cover: '', portfolio: '', linkedinUrl: '' },
  { siteId: 'lever',          siteName: 'Lever',          resumes: [], cover: '', portfolio: '', linkedinUrl: '' },
  { siteId: 'indeed',         siteName: 'Indeed',         resumes: [], cover: '', portfolio: '', linkedinUrl: '' },
]

const ALL_SITES = [
  { id: 'linkedin',        label: 'LinkedIn' },
  { id: 'greenhouse',      label: 'Greenhouse' },
  { id: 'workday',         label: 'Workday' },
  { id: 'lever',           label: 'Lever' },
  { id: 'ashby',            label: 'Ashby' },
  { id: 'indeed',          label: 'Indeed' },
  { id: 'glassdoor',       label: 'Glassdoor' },
  { id: 'smartrecruiters', label: 'SmartRecruiters' },
  { id: 'workable',        label: 'Workable' },
  { id: 'custom',          label: 'Custom / Company Site' },
]

export default function AttachView({ onSave }: { onSave: (m: string) => void }) {
  const [profiles, setProfiles] = useState<{id:string,name:string}[]>([])
  const [activeProfile, setActiveProfile] = useState('default')
  const [sites, setSites] = useState<SiteAttachment[]>(DEFAULT_SITES)
  const [newSiteId, setNewSiteId] = useState('')

  const attachFile = (id: string) => `config/profiles/${id}.attachments.yaml`

  const loadForProfile = async (id: string) => {
    try {
      const y = await window.jobbot.fsRead(attachFile(id))
      const parsed = YAML.parse(y) as SiteAttachment[]
      if (parsed?.length) { setSites(parsed); return }
    } catch {}
    // fallback to global legacy file
    try {
      const y2 = await window.jobbot.fsRead('config/attachments.yaml')
      const parsed2 = YAML.parse(y2) as SiteAttachment[]
      if (parsed2?.length) setSites(parsed2)
      else setSites(DEFAULT_SITES)
    } catch { setSites(DEFAULT_SITES) }
  }

  useEffect(() => {
    window.jobbot.fsRead('config/profile.yaml').then(y=>{
      const m=y.match(/active_profile:\s*(\S+)/)
      const active=m?m[1].trim():'default'
      setActiveProfile(active)
      window.jobbot.fsReadDir('config/profiles').then(entries=>{
        const ids=entries.filter(e=>e.name.endsWith('.yaml') && !e.name.includes('.attachments')).map(e=>e.name.replace('.yaml',''))
        const list=ids.map(id=>({id, name:id}))
        if(list.length) setProfiles(list)
        loadForProfile(active)
      }).catch(()=> loadForProfile(active))
    }).catch(()=> loadForProfile('default'))
  }, [])

  const pickFile = async (field: keyof SiteAttachment, siteId: string, idx?: number) => {
    const paths = await window.jobbot.openFile([
      { name: 'Documents', extensions: ['pdf', 'docx', 'doc'] }
    ])
    if (!paths.length) return
    setSites(prev => prev.map(s => {
      if (s.siteId !== siteId) return s
      if (idx !== undefined) {
        const resumes = [...s.resumes]
        resumes[idx] = paths[0]
        return { ...s, resumes }
      }
      return { ...s, [field]: paths[0] }
    }))
  }

  const addSite = () => {
    if (!newSiteId) return
    const existing = ALL_SITES.find(s => s.id === newSiteId)
    if (!existing) return
    if (sites.find(s => s.siteId === newSiteId)) return
    setSites(prev => [...prev, {
      siteId: newSiteId, siteName: existing.label,
      resumes: ['', '', ''], cover: '', portfolio: '', linkedinUrl: ''
    }])
    setNewSiteId('')
  }

  const removeSite = (siteId: string) =>
    setSites(prev => prev.filter(s => s.siteId !== siteId))

  const updateSite = (siteId: string, patch: Partial<SiteAttachment>) =>
    setSites(prev => prev.map(s => s.siteId === siteId ? { ...s, ...patch } : s))

  const switchProfile = async (id: string) => {
    setActiveProfile(id)
    await window.jobbot.fsWrite('config/profile.yaml', `active_profile: ${id}\n`)
    await loadForProfile(id)
  }

  const save = async () => {
    const yaml = YAML.stringify(sites)
    await window.jobbot.fsWrite(attachFile(activeProfile), yaml)
    // keep legacy file in sync for single-profile clones
    await window.jobbot.fsWrite('config/attachments.yaml', yaml)
    onSave(`Attachments saved for ${activeProfile}`)
  }

  const activeSites = sites.filter(s => s.siteId !== 'custom' || s.resumes.some(r => r) || s.cover)

  return (
    <div>
      <h1>Attachments</h1>
      <p>Upload resumes per site <strong>per profile</strong>. Each site gets up to 3 resumes — the runner attaches the right one for the active profile. <span className="muted">Active: {activeProfile}</span></p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <select className="select" style={{ maxWidth: 220 }} value={activeProfile} onChange={e=>switchProfile(e.target.value)}>
          {profiles.map(p=> <option key={p.id} value={p.id}>{p.name}</option>)}
          {!profiles.find(p=>p.id===activeProfile) && <option value={activeProfile}>{activeProfile}</option>}
        </select>
        <span className="muted" style={{ fontSize: 11, alignSelf: 'center' }}>Resumes are stored per profile — switch profile to manage its files.</span>
      </div>

      {sites.map(site => (
        <div key={site.siteId} className="card">
          <div className="card-header">
            <h2>{site.siteName}</h2>
            <button className="btn btn-danger btn-sm" onClick={() => removeSite(site.siteId)}>Remove</button>
          </div>

          <div className="grid-3" style={{ marginBottom: 12 }}>
            {[0, 1, 2].map(idx => (
              <div key={idx} className="field">
                <label className="label">Resume {idx + 1}{idx === 0 ? ' (primary)' : ''}</label>
                <div className="input-group">
                  <input className="input" readOnly value={site.resumes[idx] || ''}
                    placeholder="No file chosen" />
                  <button className="btn btn-secondary btn-sm"
                    onClick={() => pickFile('resumes', site.siteId, idx)}>Choose</button>
                </div>
              </div>
            ))}
          </div>

          <div className="grid-2">
            <div className="field">
              <label className="label">Cover Letter</label>
              <div className="input-group">
                <input className="input" readOnly value={site.cover}
                  placeholder="No file chosen" />
                <button className="btn btn-secondary btn-sm"
                  onClick={() => pickFile('cover', site.siteId)}>Choose</button>
              </div>
            </div>
            <div className="field">
              <label className="label">Portfolio / Other</label>
              <div className="input-group">
                <input className="input" readOnly value={site.portfolio}
                  placeholder="No file chosen" />
                <button className="btn btn-secondary btn-sm"
                  onClick={() => pickFile('portfolio', site.siteId)}>Choose</button>
              </div>
            </div>
          </div>

          {site.siteId === 'linkedin' && (
            <div className="field" style={{ marginTop: 10 }}>
              <label className="label">LinkedIn Profile URL</label>
              <input className="input" value={site.linkedinUrl}
                placeholder="https://linkedin.com/in/your-name"
                onChange={e => updateSite(site.siteId, { linkedinUrl: e.target.value })} />
            </div>
          )}
        </div>
      ))}

      {/* Add site */}
      <div className="card">
        <h3>Add Site</h3>
        <div className="input-group">
          <select className="select" value={newSiteId}
            onChange={e => setNewSiteId(e.target.value)}>
            <option value="">Pick a board...</option>
            {ALL_SITES.filter(s => !sites.find(site => site.siteId === s.id))
              .map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <button className="btn btn-secondary" onClick={addSite}>Add</button>
        </div>
      </div>

      <button className="btn btn-primary" onClick={save}>Save Attachments</button>
    </div>
  )
}

const YAML = {
  stringify: (obj: unknown): string => {
    const lines: string[] = ['---']
    const dump = (o: unknown, indent = 0) => {
      const pad = '  '.repeat(indent)
      if (Array.isArray(o)) {
        for (const item of o) {
          if (typeof item === 'object') {
            lines.push(`${pad}-`)
            dump(item, indent + 1)
          } else {
            lines.push(`${pad}- ${item}`)
          }
        }
      } else if (typeof o === 'object' && o !== null) {
        for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
          if (v && typeof v === 'object') {
            lines.push(`${pad}${k}:`)
            dump(v, indent + 1)
          } else {
            lines.push(`${pad}${k}: ${v ?? ''}`)
          }
        }
      }
    }
    dump(obj)
    return lines.join('\n')
  },
  parse: (str: string): unknown => {
    const lines = str.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'))
    let i = 0
    const parseVal = (val: string): unknown => {
      if (val === 'true') return true
      if (val === 'false') return false
      if (!isNaN(Number(val))) return Number(val)
      return val.replace(/^["']|["']$/g, '')
    }
    const parseBlock = (indent: number): unknown => {
      const result: unknown[] = []
      let current: Record<string, unknown> = {}
      while (i < lines.length) {
        const line = lines[i]
        const lineIndent = line.search(/\S/)
        if (lineIndent < indent) break
        if (line.trim() === '---') { i++; continue }
        if (lineIndent === -1) { i++; continue }
        const content = line.trim()
        if (content.startsWith('- ')) {
          const val = content.slice(2).trim()
          if (val.startsWith('{')) {
            try { result.push(JSON.parse(val)); i++ } catch { i++ }
          } else {
            result.push(val)
            i++
          }
        } else {
          const colonIdx = content.indexOf(':')
          if (colonIdx === -1) { i++; continue }
          const key = content.slice(0, colonIdx).trim()
          const rest = content.slice(colonIdx + 1).trim()
          if (rest === '') {
            i++
            const nested = parseBlock(indent + 2)
            if (Array.isArray(nested)) current[key] = nested
            else current[key] = nested
          } else {
            current[key] = parseVal(rest)
            i++
          }
        }
      }
      return result.length ? result : current
    }
    const out = parseBlock(0)
    return Array.isArray(out) ? out : [out]
  }
}
