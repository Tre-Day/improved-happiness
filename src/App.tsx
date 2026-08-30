import { useState } from 'react'
import Nav from './components/Nav'
import ChatOverlay from './components/ChatOverlay'
import CouchView from './views/CouchView'
import KeysView from './views/KeysView'
import SearchView from './views/SearchView'
import AttachView from './views/AttachView'
import RunView from './views/RunView'
import ReportView from './views/ReportView'

type View = 'couch' | 'keys' | 'search' | 'attach' | 'run' | 'report'

export default function App() {
  const [view, setView] = useState<View>('couch')
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  return (
    <div className="app">
      {/* LinkedIn-inspired dark topbar */}
      <header className="topbar">
        <div className="topbar-brand">
          <div className="topbar-logo">in</div>
          <div>
            <div className="topbar-title">JobBot</div>
            <div className="topbar-sub">The Couch · LaziBot Command Center</div>
          </div>
        </div>
        <div className="topbar-actions">
          <span className="muted" style={{ fontSize: 11 }}>
            Welcome 2 The Couch — LaziBot is on duty
          </span>
          <button className="btn btn-secondary btn-sm" onClick={() => setView('couch')}>🏠 The Couch</button>
        </div>
      </header>

      <Nav view={view} onNav={setView} />

      <main className="content">
        {view === 'couch'  && <CouchView onGo={(v) => setView(v as View)} />}
        {view === 'keys'   && <KeysView onSave={showToast} />}
        {view === 'search' && <SearchView onSave={showToast} />}
        {view === 'attach' && <AttachView onSave={showToast} />}
        {view === 'run'    && <RunView onSave={showToast} />}
        {view === 'report' && <ReportView onSave={showToast} />}
      </main>

      {/* ChatGPT-style bottom-fixed LaziBot overlay — on every page */}
      <ChatOverlay />

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
