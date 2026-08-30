import { useState, useEffect, useRef } from 'react'

type RunStatus = 'idle' | 'running' | 'done' | 'error'

export default function RunView({ onSave }: { onSave: (m: string) => void }) {
  const [status, setStatus] = useState<RunStatus>('idle')
  const [logLines, setLogLines] = useState<string[]>([])
  const [dryRun, setDryRun] = useState(true)
  const [maxApply, setMaxApply] = useState(20)
  const [profiles, setProfiles] = useState<{ id: string; name: string }[]>([{ id: 'default', name: 'Default' }])
  const [persona, setPersona] = useState('default')
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.jobbot.fsRead('config/search.yaml').then(y => {
      try {
        const doc = YAML.parse(y) as { dryRun?: boolean; maxApply?: number }
        if (doc.dryRun !== undefined) setDryRun(doc.dryRun)
      } catch {}
    }).catch(() => {})
    // Load profiles — no hardcodes, you create them in The Couch
    window.jobbot.fsRead('config/profile.yaml').then(y => {
      try {
        const p = YAML.parse(y) as { name?: string; active_profile?: string }
        const active = p.active_profile || 'default'
        setPersona(active)
        // also scan profiles/ dir
        window.jobbot.fsReadDir('config/profiles').then(entries => {
          const list = entries.filter(e => e.name.endsWith('.yaml')).map(e => ({ id: e.name.replace('.yaml',''), name: e.name.replace('.yaml','') }))
          if (list.length) {
            // try to read each for display name
            Promise.all(list.map(async li => {
              try { const raw = await window.jobbot.fsRead(`config/profiles/${li.id}.yaml`); const doc = YAML.parse(raw) as { name?: string }; return { id: li.id, name: doc.name || li.id } } catch { return li }
            })).then(resolved => setProfiles(resolved))
          }
        }).catch(()=>{})
        // if main profile has a name, ensure it's in list
        if (p.name) setProfiles(prev => prev.find(x=>x.id===active) ? prev : [...prev, { id: active, name: p.name as string }])
      } catch {}
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logLines])

  const addLog = (line: string, type = '') => {
    setLogLines(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${line}`])
  }

  const runDiscover = async () => {
    setStatus('running')
    setLogLines([])
    addLog('Starting discover pipeline...', 'ok')
    try {
      const result = await window.jobbot.pyRun('run_pipeline.py', ['doall'])
      if (result.code === 0) {
        addLog('Discover complete.', 'ok')
        const lines = (result.out || '').split('\n')
        const last = lines[lines.length - 1] || ''
        addLog(last, 'ok')
      } else {
        addLog(`Discover failed rc=${result.code}: ${result.err}`, 'err')
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      addLog(`Error: ${msg}`, 'err')
    }
    setStatus('done')
  }

  const runApply = async () => {
    setStatus('running')
    setLogLines([])
    addLog('Starting apply run...', 'ok')
    if (dryRun) addLog('DRY RUN MODE — no submissions will be made', 'warn')
    addLog(`Persona: ${persona}  Max: ${maxApply}  Target boards: all enabled`, '')

    const args = [
      '--headless',
      `--persona=${persona}`,
      `--max=${maxApply}`,
      dryRun ? '--dry-run' : '',
    ].filter(Boolean)

    try {
      const result = await window.jobbot.pyRun('applier/playwright_runner.py', args)
      if (result.code === 0) {
        addLog('Apply run complete.', 'ok')
        ;(result.out || '').split('\n').forEach(l => { if (l.trim()) addLog(l, 'ok') })
      } else {
        addLog(`Apply failed rc=${result.code}`, 'err')
        ;(result.err || '').split('\n').forEach(l => { if (l.trim()) addLog(l, 'err') })
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      addLog(`Error: ${msg}`, 'err')
    }
    setStatus('done')
  }

  const openReport = async () => {
    try {
      // Prefer in-app Report tab; also try to open the file portably if Electron exposes it
      // No hardcoded absolute paths — works on any user's machine / GitHub clone
      const html = await window.jobbot.fsRead('data/report.html')
      const blob = new Blob([html], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
    } catch {
      // fallback: just stay on Report tab — user can click Report in nav
    }
  }

  const openTrackerCsv = async () => {
    try {
      const csv = await window.jobbot.fsRead('data/tracker.csv')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
    } catch {}
  }

  return (
    <div>
      <h1>Run</h1>
      <p>Run the discover + apply pipeline. Open the Report tab to see results, or <button className="btn btn-secondary btn-sm" onClick={openTrackerCsv}>Open tracker.csv</button></p>

      {/* Controls */}
      <div className="card">
        <div className="card-header"><h2>Run Controls</h2>
          {status === 'running' && <span className="badge badge-yellow">Running...</span>}
          {status === 'done'    && <span className="badge badge-green">Done</span>}
          {status === 'error'   && <span className="badge badge-red">Error</span>}
          {status === 'idle'     && <span className="badge badge-gray">Idle</span>}
        </div>
        <div className="grid-2">
          <div className="field">
            <label className="label">Profile (from The Couch — no hardcodes)</label>
            <select className="select" value={persona} onChange={e => setPersona(e.target.value)}>
              {profiles.map(p => (
                <option key={p.id} value={p.id}>{p.name || p.id}</option>
              ))}
              {profiles.length === 0 && <option value="default">default — create one in The Couch</option>}
            </select>
            {profiles.length === 0 && (
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>No profiles yet — go to <strong>The Couch</strong> and create one. Nothing is hardcoded.</div>
            )}
          </div>
          <div className="field">
            <label className="label">Dry Run
              <input type="checkbox" checked={dryRun} onChange={e => setDryRun(e.target.checked)}
                style={{ marginLeft: 8, accentColor: 'var(--accent)' }} />
            </label>
            <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
              {dryRun ? 'Logging what would apply, not submitting' : 'REAL SUBMISSIONS — may violate ToS'}
            </p>
          </div>
        </div>
        <div className="field">
          <label className="label">Max applies this run  <span className="slider-val">{maxApply}</span></label>
          <div className="slider-row">
            <input type="range" className="slider" min={1} max={100} value={maxApply}
              onChange={e => setMaxApply(Number(e.target.value))} />
          </div>
        </div>
        <div className="flex gap-md" style={{ marginTop: 12 }}>
          <button className="btn btn-secondary" onClick={runDiscover} disabled={status === 'running'}>
            🔍 Discover Only
          </button>
          <button className="btn btn-primary" onClick={runApply} disabled={status === 'running'}>
            ▶ Apply Now
          </button>
          <button className="btn btn-success" onClick={openReport}>
            📊 Open Report
          </button>
        </div>
      </div>

      {/* Log */}
      <div className="card">
        <div className="card-header">
          <h2>Run Log</h2>
          <button className="btn btn-secondary btn-sm" onClick={() => setLogLines([])}>Clear</button>
        </div>
        <div className="log-box" ref={logRef}>
          {logLines.length === 0 && (
            <span style={{ color: 'var(--text3)' }}>No output yet. Run a pipeline above.</span>
          )}
          {logLines.map((line, i) => {
            const isErr = line.includes('[err]') || line.includes('Error') || line.includes('failed')
            const isWarn = line.includes('[warn]') || line.includes('DRY')
            const isOk = line.includes('[ok]') || line.includes('complete') || line.includes('Done')
            return (
              <div key={i} className={
                `log-line${isErr ? '-err' : isWarn ? '-warn' : isOk ? '-ok' : ''}`
              }>{line}</div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const YAML = {
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
