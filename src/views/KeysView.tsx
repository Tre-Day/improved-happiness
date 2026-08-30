import { useState, useEffect, useCallback } from 'react'

interface ModelEntry { id: string; provider: string; enabled: boolean }
interface KeyEntry {
  id: string; name: string; provider: string; sdk: string
  apiKey: string; baseUrl: string; enabled: boolean; ollamaFallback: boolean
}

const DEFAULT_KEYS: KeyEntry[] = [
  { id: '1', name: 'Poolside Laguna', provider: 'poolside-laguna', sdk: 'openai-chat',
    apiKey: '', baseUrl: 'https://api.poolside.ai/v1', enabled: false, ollamaFallback: false },
  { id: '2', name: 'Ollama Local', provider: 'ollama', sdk: 'openai-chat',
    apiKey: '', baseUrl: 'http://localhost:11434/v1', enabled: true, ollamaFallback: true },
  { id: '3', name: 'OpenAI BYOK', provider: 'openai', sdk: 'openai-chat',
    apiKey: '', baseUrl: 'https://api.openai.com/v1', enabled: false, ollamaFallback: false },
  { id: '4', name: 'Anthropic BYOK', provider: 'anthropic', sdk: 'anthropic',
    apiKey: '', baseUrl: 'https://api.anthropic.com/v1', enabled: false, ollamaFallback: false },
]

const PROVIDERS = ['openai', 'anthropic', 'poolside-laguna', 'ollama', 'custom']
const SDKS = ['openai-chat', 'anthropic', 'custom']

function modelKey(e: ModelEntry) { return e.id }

export default function KeysView({ onSave }: { onSave: (m: string) => void }) {
  const [keys, setKeys] = useState<KeyEntry[]>(DEFAULT_KEYS)
  const [models, setModels] = useState<ModelEntry[]>([])
  const [modelSearch, setModelSearch] = useState('')
  const [fetchingKeyId, setFetchingKeyId] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    window.jobbot.fsRead('config/models.json')
      .then(j => { try { setModels(JSON.parse(j)) } catch { setModels([]) } })
      .catch(() => {})
    window.jobbot.fsRead('config/keys.yaml')
      .then(y => { try { const k = YAML.parse(y) as KeyEntry[]; if (k?.length) setKeys(k) } catch {} })
      .catch(() => {})
  }, [])

  const saveKeys = useCallback(async (k: KeyEntry[]) => {
    const yaml = YAML.stringify(k)
    await window.jobbot.fsWrite('config/keys.yaml', yaml)
    await window.jobbot.fsWrite('config/models.json', JSON.stringify(models, null, 2))
    onSave('Keys saved')
  }, [models, onSave])

  const addKey = () => {
    const n: KeyEntry = { id: Date.now().toString(), name: '', provider: 'custom',
      sdk: 'openai-chat', apiKey: '', baseUrl: '', enabled: false, ollamaFallback: false }
    setKeys(prev => [...prev, n])
  }

  const removeKey = (id: string) => setKeys(prev => prev.filter(k => k.id !== id))

  const updateKey = (id: string, patch: Partial<KeyEntry>) =>
    setKeys(prev => prev.map(k => k.id === id ? { ...k, ...patch } : k))

  const fetchModels = async (k: KeyEntry) => {
    if (!k.baseUrl || (!k.apiKey && k.provider !== 'ollama')) {
      setFetchError('Need base URL' + (k.provider !== 'ollama' ? ' + API key' : ''))
      return
    }
    setFetchingKeyId(k.id)
    setFetchError(null)
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (k.apiKey) headers['Authorization'] = `Bearer ${k.apiKey}`
      const url = k.provider === 'ollama'
        ? `${k.baseUrl}/api/tags`
        : `${k.baseUrl}/models`
      const resp = await fetch(url, { headers })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      let ids: string[] = []
      if (k.provider === 'ollama') {
        ids = (data.models || []).map((m: { name: string }) => m.name)
      } else {
        ids = (data.data || []).map((m: { id: string }) => m.id)
      }
      const newModels: ModelEntry[] = ids.map(id => ({
        id, provider: k.provider, enabled: false
      }))
      setModels(prev => {
        const existing = new Set(prev.map(modelKey))
        const merged = prev.filter(m => m.provider !== k.provider)
        return [...merged, ...newModels.filter(m => !existing.has(modelKey(m)) || prev.find(p => p.id === m.id)?.enabled)]
      })
      onSave(`Fetched ${ids.length} models from ${k.name}`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setFetchError(`Fetch failed: ${msg}`)
    } finally {
      setFetchingKeyId(null)
    }
  }

  const toggleModel = (id: string) =>
    setModels(prev => prev.map(m => m.id === id ? { ...m, enabled: !m.enabled } : m))

  const toggleAll = (enabled: boolean) =>
    setModels(prev => prev.map(m => ({ ...m, enabled })))

  const filteredModels = modelSearch
    ? models.filter(m => m.id.toLowerCase().includes(modelSearch.toLowerCase()))
    : models

  const enabledCount = models.filter(m => m.enabled).length
  const providerModels = (provider: string) => models.filter(m => m.provider === provider)
  const groupedModels = [...new Set(models.map(m => m.provider))]

  return (
    <div>
      <h1>Keys &amp; Models</h1>
      <p>Add API keys and fetch models. Check the ones you want to use. Ollama runs locally.</p>

      {/* ── Keys ── */}
      <div className="card">
        <div className="card-header">
          <h2>API Keys</h2>
          <button className="btn btn-secondary btn-sm" onClick={addKey}>+ Add Key</button>
        </div>
        {keys.map(k => (
          <div key={k.id} className="card" style={{ background: 'var(--surface2)', marginBottom: 10 }}>
            <div className="grid-2 gap-sm">
              <div className="field">
                <label className="label">Name</label>
                <input className="input" value={k.name} placeholder="My Poolside Key"
                  onChange={e => updateKey(k.id, { name: e.target.value })} />
              </div>
              <div className="field">
                <label className="label">Provider</label>
                <select className="select" value={k.provider}
                  onChange={e => updateKey(k.id, { provider: e.target.value })}>
                  {PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div className="grid-2 gap-sm">
              <div className="field">
                <label className="label">SDK</label>
                <select className="select" value={k.sdk}
                  onChange={e => updateKey(k.id, { sdk: e.target.value })}>
                  {SDKS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="label">API Key</label>
                <input className="input" type="password" value={k.apiKey} placeholder="sk-..."
                  onChange={e => updateKey(k.id, { apiKey: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label className="label">Base URL</label>
              <div className="input-group">
                <input className="input" value={k.baseUrl} placeholder="https://api.example.com/v1"
                  onChange={e => updateKey(k.id, { baseUrl: e.target.value })} />
                <button className="btn btn-secondary btn-sm"
                  onClick={() => fetchModels(k)}
                  disabled={fetchingKeyId === k.id}>
                  {fetchingKeyId === k.id ? '...' : 'Fetch'}
                </button>
              </div>
            </div>
            <div className="flex gap-md">
              <label className="checkbox-row">
                <input type="checkbox" checked={k.enabled}
                  onChange={e => updateKey(k.id, { enabled: e.target.checked })} />
                Active
              </label>
              <label className="checkbox-row">
                <input type="checkbox" checked={k.ollamaFallback}
                  onChange={e => updateKey(k.id, { ollamaFallback: e.target.checked })} />
                Use as fallback
              </label>
              <div style={{ flex: 1 }} />
              <button className="btn btn-danger btn-sm" onClick={() => removeKey(k.id)}>Remove</button>
            </div>
          </div>
        ))}
        {fetchError && <p style={{ color: 'var(--red)', fontSize: 12 }}>{fetchError}</p>}
        <button className="btn btn-primary" onClick={() => saveKeys(keys)}>Save All Keys</button>
      </div>

      {/* ── Models ── */}
      {models.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2>Models ({enabledCount} / {models.length} enabled)</h2>
            <div className="flex gap-sm">
              <button className="btn btn-secondary btn-sm" onClick={() => toggleAll(true)}>Enable All</button>
              <button className="btn btn-secondary btn-sm" onClick={() => toggleAll(false)}>Disable All</button>
            </div>
          </div>
          <div className="model-search">
            <input className="input" placeholder="Search models..." value={modelSearch}
              onChange={e => setModelSearch(e.target.value)} />
          </div>
          {groupedModels.map(provider => {
            const pModels = providerModels(provider).filter(m =>
              !modelSearch || m.id.toLowerCase().includes(modelSearch.toLowerCase())
            )
            if (!pModels.length) return null
            return (
              <div key={provider} style={{ marginBottom: 12 }}>
                <h3>{provider} ({pModels.filter(m => m.enabled).length}/{pModels.length})</h3>
                <div className="model-list">
                  {pModels.map(m => (
                    <label key={m.id} className="model-item">
                      <input type="checkbox" checked={m.enabled} onChange={() => toggleModel(m.id)} />
                      <span className="model-id">{m.id}</span>
                    </label>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {models.length === 0 && (
        <div className="card">
          <p>No models fetched yet. Add a key above and click <strong>Fetch</strong> to pull model lists from your providers.</p>
        </div>
      )}
    </div>
  )
}

// tiny YAML fallback
const YAML = {
  stringify: (obj: unknown) => {
    const lines: string[] = []
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (Array.isArray(v)) {
        lines.push(`${k}:`)
        for (const item of v as unknown[]) {
          if (typeof item === 'object') {
            lines.push(`  - ${JSON.stringify(item)}`)
          } else {
            lines.push(`  - ${item}`)
          }
        }
      } else if (typeof v === 'object' && v !== null) {
        lines.push(`${k}: ${JSON.stringify(v)}`)
      } else {
        lines.push(`${k}: ${v}`)
      }
    }
    return lines.join('\n')
  },
  parse: (str: string) => {
    const result: unknown[] = []
    const lines = str.split('\n')
    let current: Record<string, unknown> = {}
    for (const line of lines) {
      const kv = line.split(': ')
      if (kv.length >= 2) {
        current[kv[0]] = kv.slice(1).join(': ')
      } else if (line.trim() === '---') {
        if (Object.keys(current).length) result.push(current)
        current = {}
      }
    }
    if (Object.keys(current).length) result.push(current)
    return result
  }
}
