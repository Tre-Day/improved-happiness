import { app, BrowserWindow, ipcMain, dialog, shell, safeStorage } from 'electron'
import { join } from 'path'
import log from 'electron-log'
import { spawn, ChildProcess } from 'child_process'
import * as fs from 'fs'

process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'

log.initialize({ preload: true })
log.info('JobBot main starting...')

let mainWindow: BrowserWindow | null = null
let pythonProc: ChildProcess | null = null

const isDev = !app.isPackaged
const ROOT = isDev
  ? join(__dirname, '..')
  : join(app.getAppPath())

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f0f1a',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    },
    titleBarStyle: 'default',
    show: false
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    log.info('main window shown')
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(ROOT, 'dist', 'index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function getPythonExe(): string {
  const venvPy = join(ROOT, 'venv', 'Scripts', 'python.exe')
  if (fs.existsSync(venvPy)) return venvPy
  // fallback to system python — for dev without venv (portable, not hardcoded to user)
  return 'python'
}

function startPythonBackend() {
  const pythonExe = getPythonExe()
  const script = join(ROOT, 'backend', 'api_server.py')
  if (pythonExe === 'python' && !fs.existsSync(join(ROOT, 'backend', 'api_server.py'))) {
    log.warn('python backend not found — skipping')
    return
  }
  pythonProc = spawn(pythonExe, [script], {
    cwd: ROOT,
    env: { ...process.env, ROOT },
    stdio: ['pipe', 'pipe', 'pipe']
  })
  pythonProc.stdout?.on('data', (d) => log.info('[py]', d.toString().trim()))
  pythonProc.stderr?.on('data', (d) => log.warn('[py-err]', d.toString().trim()))
  pythonProc.on('exit', (c) => log.info('python backend exited', c))
}

app.whenReady().then(() => {
  log.info('app ready')
  createWindow()
  startPythonBackend()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  pythonProc?.kill()
  if (process.platform !== 'darwin') app.quit()
})

// IPC: run a python script and return stdout
ipcMain.handle('py:run', async (_event, script: string, args: string[]) => {
  return new Promise((resolve) => {
    const pythonExe = getPythonExe()
    const fullScript = join(ROOT, 'backend', script)
    const proc = spawn(pythonExe, [fullScript, ...args], {
      cwd: join(ROOT, 'backend'),
      env: { ...process.env, ROOT },
      stdio: ['pipe', 'pipe', 'pipe']
    })
    let out = '', err = ''
    proc.stdout?.on('data', (d) => { out += d.toString() })
    proc.stderr?.on('data', (d) => { err += d.toString() })
    proc.on('close', (code) => resolve({ code, out: out.trim(), err: err.trim() }))
    proc.on('error', (e) => resolve({ code: -1, out: '', err: String(e) }))
  })
})

// IPC: read a config file
ipcMain.handle('fs:read', async (_event, relPath: string) => {
  const content = fs.readFileSync(join(ROOT, relPath), 'utf-8')
  return content
})

// IPC: write a config file
ipcMain.handle('fs:write', async (_event, relPath: string, content: string) => {
  fs.writeFileSync(join(ROOT, relPath), content, 'utf-8')
  return true
})

// IPC: open a file dialog
ipcMain.handle('dialog:openFile', async (_event, filters?: Electron.FileFilter[]) => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile', 'multiSelections'],
    filters: filters || [{ name: 'All Files', extensions: ['*'] }]
  })
  return result.filePaths
})

// IPC: open external URL
ipcMain.handle('shell:openExternal', async (_event, url: string) => {
  await shell.openExternal(url)
})

// IPC: read directory
ipcMain.handle('fs:readDir', async (_event, relPath: string) => {
  const full = join(ROOT, relPath)
  if (!fs.existsSync(full)) return []
  return fs.readdirSync(full).map(name => {
    const stat = fs.statSync(join(full, name))
    return { name, isDir: stat.isDirectory() }
  })
})

// IPC: vault — DPAPI via Electron safeStorage (Windows Data Protection API, OS-level, not browser)
// The app's browser is Playwright's bundled Chromium — not your Chrome — with its own internet.
// Passwords are encrypted at rest per Windows user; UI only shows •••• unless you Reveal with OS prompt.
ipcMain.handle('vault:available', async () => safeStorage.isEncryptionAvailable())

ipcMain.handle('vault:encrypt', async (_event, plaintext: string) => {
  if (!safeStorage.isEncryptionAvailable()) return { ok: false, error: 'safeStorage not available' }
  const buf = safeStorage.encryptString(plaintext)
  return { ok: true, data: buf.toString('base64') }
})

ipcMain.handle('vault:decrypt', async (_event, b64: string) => {
  if (!safeStorage.isEncryptionAvailable()) return { ok: false, error: 'safeStorage not available' }
  try {
    const buf = Buffer.from(b64, 'base64')
    const plain = safeStorage.decryptString(buf)
    return { ok: true, data: plain }
  } catch (e) { return { ok: false, error: String(e) } }
})
