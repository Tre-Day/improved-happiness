import { useState, useEffect } from 'react'

interface TrackerRow {
  'Job Title'?: string; Title?: string
  Company?: string; Location?: string; Platform?: string; Source?: string
  URL?: string; Link?: string; Status?: string; score?: string; reasons?: string
  applied_at?: string; apply_status?: string
}

interface LogEntry {
  url: string; board: string; score: number; applied_at: string
  status: string; screenshot?: string; tailored_resume?: string; error?: string
}

const STATUS_COLORS: Record<string, string> = {
  applied: 'badge-green', queued: 'badge-yellow', failed: 'badge-red',
  blocked: 'badge-red', captcha: 'badge-yellow', dry_run: 'badge-gray',
  discovered: 'badge-gray', 'ai-rejected': 'badge-red',
}

export default function ReportView({ onSave }: { onSave: (m: string) => void }) {
  const [rows, setRows] = useState<TrackerRow[]>([])
  const [log, setLog] = useState<LogEntry[]>([])
  const [filter, setFilter] = useState<'all' | 'applied' | 'failed' | 'queued'>('all')
  const [search, setSearch] = useState('')
  const [boardFilter, setBoardFilter] = useState('all')
  const [minScore, setMinScore] = useState(0)
  const [stats, setStats] = useState({ total: 0, applied: 0, failed: 0, queued: 0, scoreAvg: 0 })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const csvText = await window.jobbot.fsRead('data/tracker.csv')
      const lines = csvText.split('\n').filter(l => l.trim())
      if (lines.length < 2) return
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
      const dataRows: TrackerRow[] = []
      for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(',')
        const row: Record<string, string> = {}
        headers.forEach((h, idx) => { row[h] = (vals[idx] || '').trim().replace(/"/g, '') })
        dataRows.push(row as TrackerRow)
      }
      setRows(dataRows)

      const applied = dataRows.filter(r => r.apply_status === 'applied')
      const failed  = dataRows.filter(r => ['failed','blocked','captcha'].includes(r.apply_status || ''))
      const queued  = dataRows.filter(r => r.Status === 'discovered' || r.apply_status === 'queued')
      const scores  = dataRows.map(r => parseInt(r.score || '0')).filter(s => !isNaN(s))
      const avg     = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
      setStats({ total: dataRows.length, applied: applied.length, failed: failed.length, queued: queued.length, scoreAvg: avg })
    } catch {}
    try {
      const logText = await window.jobbot.fsRead('data/applied_log.jsonl')
      const entries = logText.split('\n').filter(l => l.trim()).map(l => {
        try { return JSON.parse(l) as LogEntry } catch { return null }
      }).filter(Boolean) as LogEntry[]
      setLog(entries)
    } catch {}
  }

  const boards = Array.from(new Set(rows.map(r => r.Platform || r.Source || '?'))).filter(Boolean).sort()

  const exportCsv = () => {
    const headers = Object.keys(rows[0] || { 'Job Title': '', Company: '', score: '' })
    const csv = [headers.join(','), ...filteredRows.map(r => headers.map(h => `"${((r as Record<string, string>)[h] || '').toString().replace(/"/g, '""')}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'tracker-export.csv'; a.click()
    onSave(`Exported ${filteredRows.length} rows`)
  }

  const tailorRow = async (r: TrackerRow) => {
    const url = r.URL || r.Link || ''
    if (!url) return
    const res = await window.jobbot.pyRun('tailor.py', ['--job-url', url])
    onSave(res.code === 0 ? `Tailored ${url.slice(0, 30)}` : `Tailor failed: ${res.err.slice(0, 80)}`)
  }

  const coverRow = async (r: TrackerRow) => {
    const url = r.URL || r.Link || ''
    if (!url) return
    const res = await window.jobbot.pyRun('cover.py', ['--job-url', url])
    onSave(res.code === 0 ? `Cover for ${url.slice(0, 30)}` : `Cover failed: ${res.err.slice(0, 80)}`)
  }

  const filteredRows = rows.filter(r => {
    const title = (r['Job Title'] || r.Title || '').toLowerCase()
    const company = (r.Company || '').toLowerCase()
    const board = r.Platform || r.Source || '?'
    const sc = parseInt(r.score || '0')
    const matchesSearch = !search || title.includes(search.toLowerCase()) || company.includes(search.toLowerCase()) || board.toLowerCase().includes(search.toLowerCase())
    const matchesBoard = boardFilter === 'all' || board === boardFilter
    const matchesScore = sc >= minScore
    const status = r.apply_status || r.Status || ''
    const matchesFilter = filter === 'all' ? true : filter === 'applied' ? status === 'applied' : filter === 'failed' ? ['failed','blocked','captcha'].includes(status) : (status === 'discovered' || status === 'queued')
    return matchesSearch && matchesBoard && matchesScore && matchesFilter
  })

  return (
    <div>
      <h1>Report</h1>
      <p>Audit log — every job discovered, scored, and applied. Source: <code>data/tracker.csv</code> + <code>data/applied_log.jsonl</code></p>

      {/* Stats */}
      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card" style={{ margin: 0 }}>
          <h2 style={{ fontSize: 28, color: 'var(--accent2)', margin: 0 }}>{stats.total}</h2>
          <p style={{ margin: 0 }}>Jobs Discovered</p>
        </div>
        <div className="card" style={{ margin: 0 }}>
          <h2 style={{ fontSize: 28, color: 'var(--green)', margin: 0 }}>{stats.applied}</h2>
          <p style={{ margin: 0 }}>Applied ({stats.scoreAvg} avg score)</p>
        </div>
      </div>

      {/* Filters + Advanced */}
      <div className="flex gap-md" style={{ marginBottom: 8, flexWrap: 'wrap' }}>
        {(['all','applied','failed','queued'] as const).map(f => (
          <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter(f)}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f === 'applied' && stats.applied > 0 && ` (${stats.applied})`}
            {f === 'failed'  && stats.failed > 0  && ` (${stats.failed})`}
            {f === 'queued'  && stats.queued > 0  && ` (${stats.queued})`}
          </button>
        ))}
        <select className="select" style={{ width: 140 }} value={boardFilter} onChange={e => setBoardFilter(e.target.value)}>
          <option value="all">All boards</option>
          {boards.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="muted" style={{ fontSize: 11 }}>Min score</span>
          <input type="range" className="slider" style={{ width: 90 }} min={0} max={100} value={minScore} onChange={e => setMinScore(parseInt(e.target.value))} />
          <span style={{ fontSize: 11, color: 'var(--accent2)', minWidth: 24 }}>{minScore}</span>
        </div>
        <input className="input" style={{ flex: 1, minWidth: 160 }} placeholder="Search title/company/board..."
          value={search} onChange={e => setSearch(e.target.value)} />
        <button className="btn btn-secondary btn-sm" onClick={loadData}>Refresh</button>
        <button className="btn btn-primary btn-sm" onClick={exportCsv}>Export CSV</button>
      </div>
      <div className="muted" style={{ fontSize: 11, marginBottom: 10 }}>Advanced: board + score + global search — E2E headless via <code>pyRun(tailor/cover)</code> per row. Tailor/Cover generate in <code>data/tailored/</code> + <code>data/covers/</code>.</div>

      {/* Table */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Score</th>
              <th>Title</th>
              <th>Company</th>
              <th>Location</th>
              <th>Board</th>
              <th>Status</th>
              <th>Applied At</th>
              <th>Reasons</th>
              <th>AI</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.slice(0, 200).map((r, i) => {
              const title = r['Job Title'] || r.Title || '?'
              const score = parseInt(r.score || '0')
              const status = r.apply_status || r.Status || 'discovered'
              const board = r.Platform || r.Source || '?'
              return (
                <tr key={i}>
                  <td>
                    <span style={{
                      color: score >= 70 ? 'var(--green)' : score >= 50 ? 'var(--yellow)' : 'var(--text3)',
                      fontWeight: 700, fontSize: 13
                    }}>{score}</span>
                  </td>
                  <td>
                    <a href={r.URL || r.Link} target="_blank" rel="noopener noreferrer"
                      style={{ color: 'var(--accent2)', textDecoration: 'none', fontSize: 12 }}>
                      {title.slice(0, 50)}{title.length > 50 ? '…' : ''}
                    </a>
                  </td>
                  <td>{r.Company || '?'}</td>
                  <td>{r.Location || '?'}</td>
                  <td>{board}</td>
                  <td>
                    <span className={`badge ${STATUS_COLORS[status] || 'badge-gray'}`}>
                      {status}
                    </span>
                  </td>
                  <td>{r.applied_at || '—'}</td>
                  <td style={{ fontSize: 11, color: 'var(--text3)', maxWidth: 200,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.reasons || ''}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-secondary btn-sm" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => tailorRow(r)}>Tailor</button>
                      <button className="btn btn-secondary btn-sm" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => coverRow(r)}>Cover</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filteredRows.length === 0 && (
          <p style={{ padding: '20px', color: 'var(--text3)', textAlign: 'center' }}>
            No jobs match this filter. Run discover to populate tracker.
          </p>
        )}
        {filteredRows.length > 200 && (
          <p style={{ padding: '10px', color: 'var(--text3)', textAlign: 'center' }}>
            Showing 200 of {filteredRows.length} rows
          </p>
        )}
      </div>
    </div>
  )
}
