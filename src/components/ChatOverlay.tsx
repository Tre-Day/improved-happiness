import { useState, useRef, useEffect } from 'react'
import LaziBot from './LaziBot'

type Msg = { role: 'user' | 'bot'; text: string }

const QUICK_ACTIONS = [
  { label: 'Set max applies', prompt: 'Set max applies per run to 15' },
  { label: 'Change resume', prompt: 'Help me change the resume for LinkedIn' },
  { label: 'Tune scoring', prompt: 'Explain scoring and lower threshold to 45' },
  { label: 'Dry run on', prompt: 'Turn on dry run mode' },
]

function tryApplyParamCommand(prompt: string): string | null {
  const lower = prompt.toLowerCase()
  // max applies
  const maxM = lower.match(/max applies.*?(\d{1,3})/)
  if (maxM) {
    try {
      const n = parseInt(maxM[1], 10)
      if (n >= 1 && n <= 200) {
        // best-effort mutate search.yaml via preload fs (sync via async without await here — caller handles)
        return `__SET_MAX_APPLIES__:${n}`
      }
    } catch {}
  }
  if (lower.includes('dry run on') || lower.includes('enable dry run')) return '__SET_DRY_RUN__:true'
  if (lower.includes('dry run off') || lower.includes('disable dry run')) return '__SET_DRY_RUN__:false'
  return null
}

async function applyParamCommand(cmd: string): Promise<string> {
  const [action, val] = cmd.split(':')
  try {
    if (action === '__SET_MAX_APPLIES__') {
      const raw = await window.jobbot.fsRead('config/search.yaml')
      const next = raw.replace(/maxApply:\s*\d+/, `maxApply: ${val}`)
      const out = next.includes('maxApply:') ? next : raw + `\nmaxApply: ${val}\n`
      await window.jobbot.fsWrite('config/search.yaml', out)
      return `Done — max applies set to ${val}. Check Search tab.`
    }
    if (action === '__SET_DRY_RUN__') {
      const raw = await window.jobbot.fsRead('config/search.yaml')
      const needle = val === 'true' ? 'true' : 'false'
      const next = raw.includes('dryRun:') ? raw.replace(/dryRun:\s*(true|false)/, `dryRun: ${needle}`) : raw + `\ndryRun: ${needle}\n`
      await window.jobbot.fsWrite('config/search.yaml', next)
      return `Done — dry run ${val === 'true' ? 'enabled' : 'disabled'}.`
    }
  } catch (e) {
    return `Tried to apply, but failed: ${String(e).slice(0,120)}`
  }
  return 'Unknown command.'
}

async function callLLM(prompt: string): Promise<string> {
  // Try configured provider via Ollama first (local, no key), then fall back to text
  try {
    // Ollama chat
    const resp = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen2.5:7b',
        stream: false,
        messages: [
          { role: 'system', content: 'You are LaziBot, a fat, chill, slightly dirty bot from the Monastery of Laziness. You help with job hunting. Be concise, playful, a bit lazy but competent. You can set params like max applies, dry run, and help with resumes. Keep replies under 90 words.' },
          { role: 'user', content: prompt },
        ],
        options: { temperature: 0.6, num_predict: 220 },
      }),
    })
    if (resp.ok) {
      const data = await resp.json()
      const text = (data.message?.content || '').trim()
      if (text) return text
    }
  } catch {}
  // Fallback canned but helpful
  const lower = prompt.toLowerCase()
  if (lower.includes('resume')) return 'I got you — open **Attachments** and pick your 3 resumes per site. I can also tailor on apply. Tell me which board and I will set it.'
  if (lower.includes('scoring') || lower.includes('threshold')) return 'Scoring = rule scorer (title + SC keywords + remote + location). Threshold lives in **Search → Score threshold** (default 50). Say "lower threshold to 45" and I will set it.'
  if (lower.includes('max applies')) return 'Say "set max applies to 15" and I will write it to search.yaml.'
  return 'Heh — I am LaziBot, lounging on The Couch. Ask me to set max applies, toggle dry run, change resumes, or explain a page. I am wired to Ollama when it is running.'
}

export default function ChatOverlay() {
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: 'bot', text: 'Welcome 2 The Couch 🛋️ — I am LaziBot. Ask me to set max applies, change resumes, or walk you through a page.' },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [msgs, busy])

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    setMsgs(m => [...m, { role: 'user', text: trimmed }])
    setInput('')
    setBusy(true)
    const cmd = tryApplyParamCommand(trimmed)
    if (cmd) {
      const res = await applyParamCommand(cmd)
      setMsgs(m => [...m, { role: 'bot', text: res }])
      setBusy(false)
      return
    }
    const reply = await callLLM(trimmed)
    setMsgs(m => [...m, { role: 'bot', text: reply }])
    setBusy(false)
  }

  return (
    <div className="lazi-overlay" role="complementary" aria-label="LaziBot chat">
      {!collapsed && msgs.length > 1 && (
        <div ref={listRef} className="lazi-messages" aria-live="polite">
          {msgs.map((m, i) => (
            <div key={i} className={`lazi-msg ${m.role === 'user' ? 'lazi-msg-user' : 'lazi-msg-bot'}`}>
              {m.text}
            </div>
          ))}
          {busy && (
            <div className="lazi-msg lazi-msg-bot">
              <span className="lazi-typing"><span/><span/><span/></span>
            </div>
          )}
        </div>
      )}
      {collapsed && (
        <div className="lazi-messages" style={{ maxHeight: 32 }}>
          <div className="lazi-msg lazi-msg-bot" style={{ padding: '6px 10px', fontSize: 12 }}>
            LaziBot is napping — tap to wake.
          </div>
        </div>
      )}
      <div className="lazi-overlay-inner">
        <LaziBot size={42} mood={busy ? 'working' : collapsed ? 'sleepy' : 'chill'} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="lazi-input-wrap">
            <input
              className="lazi-input"
              placeholder={collapsed ? 'Wake LaziBot — ask anything…' : 'Ask LaziBot — set max applies, change resume, explain this page…'}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
              }}
              aria-label="Chat with LaziBot"
            />
            <button className="lazi-send" onClick={() => send(input)} aria-label="Send" disabled={busy || !input.trim()}>
              ↑
            </button>
          </div>
          <div className="lazi-hint">
            <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
              {QUICK_ACTIONS.map(a => (
                <button
                  key={a.label}
                  onClick={() => send(a.prompt)}
                  style={{
                    background: 'transparent', border: '1px solid var(--border2)', color: 'var(--text3)',
                    borderRadius: 999, padding: '2px 8px', fontSize: 11, cursor: 'pointer',
                  }}
                >
                  {a.label}
                </button>
              ))}
              <button
                onClick={() => setCollapsed(v => !v)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text3)', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}
              >
                {collapsed ? 'Expand' : 'Minimize'}
              </button>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
