interface JobBotAPI {
  pyRun(script: string, args?: string[]): Promise<{ code: number; out: string; err: string }>
  fsRead(relPath: string): Promise<string>
  fsWrite(relPath: string, content: string): Promise<boolean>
  fsReadDir(relPath: string): Promise<{ name: string; isDir: boolean }[]>
  openFile(filters?: { name: string; extensions: string[] }[]): Promise<string[]>
  openExternal(url: string): Promise<void>
  vaultAvailable(): Promise<boolean>
  vaultEncrypt(plaintext: string): Promise<{ ok: boolean; data?: string; error?: string }>
  vaultDecrypt(b64: string): Promise<{ ok: boolean; data?: string; error?: string }>
  onLog(cb: (line: string) => void): void
}

declare global {
  interface Window {
    jobbot: JobBotAPI
  }
}
export {}
