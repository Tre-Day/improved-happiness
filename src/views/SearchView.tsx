import { useState, useEffect } from 'react'
import { IconSearch, IconPlay, IconSave } from '../components/Icons'

interface Location { id: string; label: string; query: string; remote: boolean; bonus: number }
interface Board { id: string; label: string; enabled: boolean }

const BOARDS: Board[] = [
  { id: 'linkedin',        label: 'LinkedIn',        enabled: true },
  { id: 'indeed',          label: 'Indeed',          enabled: true },
  { id: 'glassdoor',       label: 'Glassdoor',       enabled: true },
  { id: 'google',          label: 'Google Jobs',     enabled: true },
  { id: 'ziprecruiter',    label: 'ZipRecruiter',   enabled: true },
  { id: 'greenhouse',      label: 'Greenhouse',      enabled: true },
  { id: 'lever',           label: 'Lever',           enabled: true },
  { id: 'ashby',           label: 'Ashby',          enabled: true },
  { id: 'workday',         label: 'Workday',        enabled: true },
  { id: 'smartrecruiters', label: 'SmartRecruiters',enabled: true },
  { id: 'workable',        label: 'Workable',       enabled: true },
  { id: 'flexjobs',        label: 'FlexJobs',       enabled: false },
  { id: 'naukri',          label: 'Naukri',         enabled: false },
  { id: 'bayt',            label: 'Bayt',            enabled: false },
]

const DEFAULT_LOCATIONS: Location[] = [
  { id: '1', label: 'Remote USA',      query: 'Remote United States',  remote: true,  bonus: 10 },
  { id: '2', label: 'Remote Florida',  query: 'Remote Florida',        remote: true,  bonus: 10 },
  { id: '3', label: 'Tampa, FL',       query: 'Tampa FL',              remote: false, bonus: 8 },
  { id: '4', label: 'Miami, FL',      query: 'Miami FL',             remote: false, bonus: 6 },
  { id: '5', label: 'Atlanta, GA',     query: 'Atlanta GA',            remote: false, bonus: 4 },
  { id: '6', label: 'Dallas, TX',      query: 'Dallas TX',            remote: false, bonus: 3 },
]

const DEFAULT_KEYWORDS = [
  'supply chain', 'procurement', 'sourcing', 'logistics', 'purchasing',
  'vendor management', 'category manager', 'strategic sourcing', 'operations manager',
  'demand planning', 'inventory', 'materials management', 'freight', 'distribution',
]

export default function SearchView({ onSave }: { onSave: (m: string) => void }) {
  const [boards, setBoards]     = useState<Board[]>(BOARDS)
  const [locations, setLocations] = useState<Location[]>(DEFAULT_LOCATIONS)
  const [keywords, setKeywords] = useState<string[]>(DEFAULT_KEYWORDS)
  const [newKw, setNewKw]      = useState('')
  const [maxApply, setMaxApply] = useState(20)
  const [maxPages, setMaxPages] = useState(4)
  const [delayMs, setDelayMs]  = useState(800)
  const [scoreThreshold, setScoreThreshold] = useState(50)
  const [dryRun, setDryRun]    = useState(true)

  useEffect(() => {
    window.jobbot.fsRead('config/search.yaml').then(y => {
      try {
        const doc = YAML.parse(y) as {
          boards?: Board[]; locations?: Location[]; keywords?: string[]
          maxApply?: number; maxPages?: number; delayMs?: number
          scoreThreshold?: number; dryRun?: boolean
        }
        if (doc.boards)     setBoards(doc.boards)
        if (doc.locations)  setLocations(doc.locations)
        if (doc.keywords)   setKeywords(doc.keywords)
        if (doc.maxApply)   setMaxApply(doc.maxApply)
        if (doc.maxPages)   setMaxPages(doc.maxPages)
        if (doc.delayMs)    setDelayMs(doc.delayMs)
        if (doc.scoreThreshold !== undefined) setScoreThreshold(doc.scoreThreshold)
        if (doc.dryRun !== undefined) setDryRun(doc.dryRun)
      } catch {}
    }).catch(() => {})
  }, [])

  const toggleBoard = (id: string) =>
    setBoards(prev => prev.map(b => b.id === id ? { ...b, enabled: !b.enabled } : b))

  const addLocation = () => {
    setLocations(prev => [...prev, {
      id: Date.now().toString(), label: '', query: '', remote: false, bonus: 5
    }])
  }

  const removeLocation = (id: string) =>
    setLocations(prev => prev.filter(l => l.id !== id))

  const updateLocation = (id: string, patch: Partial<Location>) =>
    setLocations(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l))

  const addKeyword = () => {
    const kw = newKw.trim()
    if (kw && !keywords.includes(kw)) {
      setKeywords(prev => [...prev, kw])
      setNewKw('')
    }
  }

  const removeKeyword = (kw: string) =>
    setKeywords(prev => prev.filter(k => k !== kw))

  const save = async () => {
    const doc = {
      boards, locations, keywords,
      maxApply, maxPages, delayMs,
      scoreThreshold, dryRun
    }
    await window.jobbot.fsWrite('config/search.yaml', YAML.stringify(doc))
    onSave('Search config saved')
  }

  const runNow = async () => {
    await save()
    const result = await window.jobbot.pyRun('run_pipeline.py', ['doall'])
    onSave(`Pipeline done — rc=${result.code}`)
  }

  return (
    <div>
      <h1>Search</h1>
      <p>Configure boards, locations, keywords, and run limits. Saved to <code>config/search.yaml</code>.</p>

      {/* Boards */}
      <div className="card">
        <div className="card-header"><h2>Job Boards</h2></div>
        <div className="grid-3">
          {boards.map(b => (
            <label key={b.id} className="checkbox-row">
              <input type="checkbox" checked={b.enabled} onChange={() => toggleBoard(b.id)} />
              {b.label}
            </label>
          ))}
        </div>
      </div>

      {/* Locations */}
      <div className="card">
        <div className="card-header">
          <h2>Locations</h2>
          <button className="btn btn-secondary btn-sm" onClick={addLocation}>+ Add Location</button>
        </div>
        {locations.map(loc => (
          <div key={loc.id} className="grid-2 gap-sm" style={{ marginBottom: 10, alignItems: 'end' }}>
            <div className="field" style={{ margin: 0 }}>
              <label className="label">Label</label>
              <input className="input" value={loc.label} placeholder="Remote Florida"
                onChange={e => updateLocation(loc.id, { label: e.target.value })} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label className="label">Search Query</label>
              <div className="input-group">
                <input className="input" value={loc.query} placeholder="Remote Florida"
                  onChange={e => updateLocation(loc.id, { query: e.target.value })} />
                <label className="checkbox-row" style={{ whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={loc.remote}
                    onChange={e => updateLocation(loc.id, { remote: e.target.checked })} />
                  Remote
                </label>
                <button className="btn btn-danger btn-sm" onClick={() => removeLocation(loc.id)}>×</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Keywords */}
      <div className="card">
        <div className="card-header"><h2>Keywords</h2></div>
        <div className="input-group" style={{ marginBottom: 8 }}>
          <input className="input" value={newKw} placeholder="Add a keyword..."
            onChange={e => setNewKw(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addKeyword()} />
          <button className="btn btn-secondary" onClick={addKeyword}>Add</button>
        </div>
        <div className="tag-list">
          {keywords.map(kw => (
            <span key={kw} className="tag">
              {kw}
              <button className="tag-remove" onClick={() => removeKeyword(kw)}>×</button>
            </span>
          ))}
        </div>
      </div>

      {/* Run limits */}
      <div className="card">
        <div className="card-header"><h2>Run Limits</h2></div>
        <div className="field">
          <label className="label">Max applies per run  <span className="slider-val">{maxApply}</span></label>
          <div className="slider-row">
            <input type="range" className="slider" min={1} max={100} value={maxApply}
              onChange={e => setMaxApply(Number(e.target.value))} />
          </div>
        </div>
        <div className="field">
          <label className="label">Max pages per board  <span className="slider-val">{maxPages}</span></label>
          <div className="slider-row">
            <input type="range" className="slider" min={1} max={20} value={maxPages}
              onChange={e => setMaxPages(Number(e.target.value))} />
          </div>
        </div>
        <div className="field">
          <label className="label">Delay between actions (ms)  <span className="slider-val">{delayMs}ms</span></label>
          <div className="slider-row">
            <input type="range" className="slider" min={200} max={3000} step={100} value={delayMs}
              onChange={e => setDelayMs(Number(e.target.value))} />
          </div>
        </div>
        <div className="field">
          <label className="label">Score threshold  <span className="slider-val">{scoreThreshold}</span></label>
          <div className="slider-row">
            <input type="range" className="slider" min={0} max={100} value={scoreThreshold}
              onChange={e => setScoreThreshold(Number(e.target.value))} />
          </div>
        </div>
        <div className="field">
          <label className="checkbox-row">
            <input type="checkbox" checked={dryRun} onChange={e => setDryRun(e.target.checked)} />
            Dry run (log what would apply, don't submit)
          </label>
        </div>
      </div>

      <div className="flex gap-md">
        <button className="btn btn-primary" onClick={save}><IconSave size={14} /> Save Config</button>
        <button className="btn btn-success" onClick={runNow}><IconPlay size={14} /> Run Discover Now</button>
      </div>
    </div>
  )
}

const YAML = {
  stringify: (obj: unknown, depth = 0): string => {
    const indent = '  '.repeat(depth)
    const lines: string[] = []
    if (Array.isArray(obj)) {
      for (const item of obj) {
        if (typeof item === 'object' && item !== null) {
          lines.push(`${indent}-`)
          lines.push(...YAML.stringify(item, depth + 1).split('\n').map(l => '  ' + l))
        } else {
          lines.push(`${indent}- ${item}`)
        }
      }
    } else if (typeof obj === 'object' && obj !== null) {
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        if (v === null || v === undefined) continue
        if (typeof v === 'object') {
          lines.push(`${indent}${k}:`)
          lines.push(...YAML.stringify(v, depth + 1).split('\n'))
        } else {
          lines.push(`${indent}${k}: ${v}`)
        }
      }
    }
    return lines.join('\n')
  },
  parse: (str: string): unknown => {
    const lines = str.split('\n')
    const result: Record<string, unknown> = {}
    let i = 0
    const parseBlock = (obj: Record<string, unknown>, indent: number): Record<string, unknown> => {
      while (i < lines.length) {
        const line = lines[i]
        if (!line.trim() || line.trim().startsWith('#')) { i++; continue }
        const lineIndent = line.search(/\S/)
        if (lineIndent < indent) break
        if (lineIndent > indent) {
          const [key, ...rest] = line.trim().split(': ')
          const val = rest.join(': ').trim()
          if (val === '' || val === 'true' || val === 'false') {
            obj[key] = val === 'true' ? true : val === 'false' ? false : val
          } else if (!isNaN(Number(val))) {
            obj[key] = Number(val)
          } else {
            obj[key] = val
          }
          i++
        } else {
          const colonIdx = line.indexOf(':')
          if (colonIdx === -1) { i++; continue }
          const key = line.slice(lineIndent, colonIdx).trim()
          const val = line.slice(colonIdx + 1).trim()
          i++
          if (val === '') {
            const nested: Record<string, unknown> = {}
            obj[key] = nested
            parseBlock(nested, indent + 2)
          } else if (val === 'true' || val === 'false') {
            obj[key] = val === 'true'
          } else if (!isNaN(Number(val))) {
            obj[key] = Number(val)
          } else {
            obj[key] = val
          }
        }
      }
      return obj
    }
    return parseBlock(result, 0)
  }
}
