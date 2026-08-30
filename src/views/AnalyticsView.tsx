import { useState, useEffect } from 'react'

export default function AnalyticsView({ onSave }: { onSave: (m: string) => void }) {
  const [rows, setRows] = useState<any[]>([])

  useEffect(() => {
    window.jobbot.fsRead('data/tracker.csv').then(t => {
      const lines = t.split('\n').filter(l => l.trim())
      if (lines.length < 2) return
      const h = lines[0].split(',').map(s => s.replace(/"/g, '').trim())
      const data = lines.slice(1).map(l => {
        const vals = l.split(',')
        const r: any = {}
        h.forEach((k, i) => r[k] = (vals[i] || '').replace(/"/g, '').trim())
        return r
      })
      setRows(data)
    }).catch(() => {})
  }, [])

  const byBoard: Record<string, number> = {}
  const byScore = { '70+': 0, '50-69': 0, '30-49': 0, '<30': 0 }
  const byDate: Record<string, number> = {}
  rows.forEach(r => {
    const b = r.Platform || r.Source || '?'
    byBoard[b] = (byBoard[b] || 0) + 1
    const s = parseInt(r.score || '0')
    if (s >= 70) byScore['70+']++
    else if (s >= 50) byScore['50-69']++
    else if (s >= 30) byScore['30-49']++
    else byScore['<30']++
    const d = r.Date || 'unknown'
    byDate[d] = (byDate[d] || 0) + 1
  })

  const maxBoard = Math.max(1, ...Object.values(byBoard))
  const maxDate = Math.max(1, ...Object.values(byDate))
  const maxScore = Math.max(1, ...Object.values(byScore))

  return (
    <div>
      <h1>Analytics</h1>
      <p className="muted">Board breakdown, score distribution, and discovery timeline — live from <code>tracker.csv</code>.</p>

      <div className="grid-2">
        <div className="card">
          <h2>By Board</h2>
          {Object.entries(byBoard).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ width: 110, fontSize: 12, color: 'var(--text2)' }}>{k}</span>
              <div style={{ flex: 1, height: 10, background: '#0c1220', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ width: `${(v / maxBoard) * 100}%`, height: '100%', background: 'var(--accent)' }} />
              </div>
              <span style={{ width: 30, fontSize: 12, color: 'var(--text3)' }}>{v}</span>
            </div>
          ))}
          {Object.keys(byBoard).length === 0 && <span className="muted">No data yet</span>}
        </div>

        <div className="card">
          <h2>Score Distribution</h2>
          {Object.entries(byScore).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ width: 50, fontSize: 12, color: 'var(--text2)' }}>{k}</span>
              <div style={{ flex: 1, height: 10, background: '#0c1220', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ width: `${(v / maxScore) * 100}%`, height: '100%', background: k === '70+' ? 'var(--green)' : k === '50-69' ? 'var(--yellow2)' : 'var(--border2)' }} />
              </div>
              <span style={{ width: 30, fontSize: 12, color: 'var(--text3)' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Discovery Timeline (by Date)</h2>
        {Object.entries(byDate).sort().slice(-12).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ width: 90, fontSize: 12, color: 'var(--text2)' }}>{k}</span>
            <div style={{ flex: 1, height: 10, background: '#0c1220', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ width: `${(v / maxDate) * 100}%`, height: '100%', background: 'var(--accent2)' }} />
            </div>
            <span style={{ width: 30, fontSize: 12, color: 'var(--text3)' }}>{v}</span>
          </div>
        ))}
        {Object.keys(byDate).length === 0 && <span className="muted">No data yet</span>}
      </div>
    </div>
  )
}
