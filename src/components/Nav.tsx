import LaziBot from './LaziBot'

type View = 'couch' | 'keys' | 'search' | 'attach' | 'run' | 'report'

interface Props { view: View; onNav: (v: View) => void }

const NAV_ITEMS: { id: View; label: string; icon: string; kicker?: string }[] = [
  { id: 'couch',  label: 'The Couch',      icon: '🛋️', kicker: 'Command Center' },
  { id: 'keys',   label: 'Keys & Models',  icon: '🔑' },
  { id: 'search', label: 'Search',         icon: '🔍' },
  { id: 'attach', label: 'Attachments',     icon: '📎' },
  { id: 'run',    label: 'Run',            icon: '▶' },
  { id: 'report', label: 'Report',         icon: '📊' },
]

export default function Nav({ view, onNav }: Props) {
  return (
    <nav className="nav">
      <div className="nav-brand">
        <LaziBot size={32} mood="chill" />
        <div>
          <h1>JobBot</h1>
          <span>LaziBot · The Couch</span>
        </div>
      </div>

      <div className="nav-section-label">Command Center</div>
      {NAV_ITEMS.slice(0, 1).map(item => (
        <div key={item.id} className={`nav-item ${view === item.id ? 'active' : ''}`} onClick={() => onNav(item.id)}>
          <span className="nav-icon">{item.icon}</span>
          <span style={{ flex: 1 }}>{item.label}</span>
          {item.kicker && <span style={{ fontSize: 9, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text3)', fontWeight: 700 }}>{item.kicker}</span>}
        </div>
      ))}

      <div className="nav-section-label">Setup</div>
      {NAV_ITEMS.slice(1, 4).map(item => (
        <div key={item.id} className={`nav-item ${view === item.id ? 'active' : ''}`} onClick={() => onNav(item.id)}>
          <span className="nav-icon">{item.icon}</span>
          {item.label}
        </div>
      ))}

      <div className="nav-section-label">Operate</div>
      {NAV_ITEMS.slice(4).map(item => (
        <div key={item.id} className={`nav-item ${view === item.id ? 'active' : ''}`} onClick={() => onNav(item.id)}>
          <span className="nav-icon">{item.icon}</span>
          {item.label}
        </div>
      ))}

      <div className="nav-footer">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <LaziBot size={22} mood="sleepy" />
          <span style={{ fontWeight: 700, color: 'var(--text2)', fontSize: 12 }}>LaziBot</span>
        </div>
        Monastery of Laziness<br />
        Fat · dirty · no hard hat<br />
        <span style={{ color: 'var(--accent2)' }}>Ask me in the chat ↓</span>
      </div>
    </nav>
  )
}
