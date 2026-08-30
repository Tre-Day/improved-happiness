import { contextBridge, ipcRenderer } from 'electron'

export type FileEntry = { name: string; isDir: boolean }

const api = {
  // Python backend
  pyRun: (script: string, args: string[] = []) =>
    ipcRenderer.invoke('py:run', script, args) as Promise<{ code: number; out: string; err: string }>,

  // File system
  fsRead: (relPath: string) =>
    ipcRenderer.invoke('fs:read', relPath) as Promise<string>,
  fsWrite: (relPath: string, content: string) =>
    ipcRenderer.invoke('fs:write', relPath, content) as Promise<boolean>,
  fsReadDir: (relPath: string) =>
    ipcRenderer.invoke('fs:readDir', relPath) as Promise<FileEntry[]>,

  // Dialog
  openFile: (filters?: { name: string; extensions: string[] }[]) =>
    ipcRenderer.invoke('dialog:openFile', filters) as Promise<string[]>,

  // Shell
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),

  // Vault — DPAPI (OS, not browser)
  vaultAvailable: () => ipcRenderer.invoke('vault:available') as Promise<boolean>,
  vaultEncrypt: (plaintext: string) => ipcRenderer.invoke('vault:encrypt', plaintext) as Promise<{ ok: boolean; data?: string; error?: string }>,
  vaultDecrypt: (b64: string) => ipcRenderer.invoke('vault:decrypt', b64) as Promise<{ ok: boolean; data?: string; error?: string }>,

  // Event listeners — streaming pipeline logs headless
  onLog: (cb: (line: string) => void) => {
    ipcRenderer.on('log', (_e, line) => cb(line))
    ipcRenderer.on('py:log', (_e, line) => cb(line))
  }
}

contextBridge.exposeInMainWorld('jobbot', api)

declare global {
  interface Window {
    jobbot: typeof api
  }
}
