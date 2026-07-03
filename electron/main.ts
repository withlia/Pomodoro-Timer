import { app, BrowserWindow, ipcMain, Notification, dialog } from 'electron'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged
const execFileAsync = promisify(execFile)
const blockStart = '# Pixel Pomodoro Block Start'
const blockEnd = '# Pixel Pomodoro Block End'
const defaultRedirectUrl = 'https://www.google.com'

type HostBlockPayload = string[] | { domains: string[]; redirectUrl?: string }

let mainWindow: BrowserWindow | null = null
let redirectServer: http.Server | null = null
let currentRedirectUrl = defaultRedirectUrl
let redirectEnabled = false
let appBlockTimer: ReturnType<typeof setInterval> | null = null
let blockedProcessNames: string[] = []
let blockedDomainSet = new Set<string>()

function getHostsPath() {
  if (process.platform === 'win32') {
    return 'C:\\Windows\\System32\\drivers\\etc\\hosts'
  }
  return '/etc/hosts'
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeDomain(domain: string) {
  return domain.trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
    .replace(/^\.+|\.+$/g, '')
}

function normalizeRedirectUrl(url: string) {
  const trimmed = url.trim()
  if (!trimmed) return ''
  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

  try {
    return new URL(withProtocol).toString()
  } catch {
    return defaultRedirectUrl
  }
}

function normalizeProcessName(processName: string) {
  const name = path.basename(processName.trim()).toLowerCase()
  if (!name) return ''
  return process.platform === 'win32' && !name.endsWith('.exe') ? `${name}.exe` : name
}

function createHostEntries(domains: string[], redirectTarget: '0.0.0.0' | '127.0.0.1') {
  const hosts = Array.from(new Set(domains.map(normalizeDomain).filter(Boolean).flatMap((domain) => [domain, `www.${domain}`])))
  const v6 = redirectTarget === '127.0.0.1' ? '::1' : '::1'
  return { hosts, entries: hosts.flatMap((host) => [`${redirectTarget} ${host}`, `${v6} ${host}`]) }
}

function stripBlock(content: string) {
  const pattern = new RegExp(`\\r?\\n?${escapeRegex(blockStart)}[\\s\\S]*?${escapeRegex(blockEnd)}\\r?\\n?`, 'g')
  return content.replace(pattern, '').trimEnd()
}

async function flushDns() {
  if (process.platform === 'win32') {
    await execFileAsync('ipconfig', ['/flushdns'], { windowsHide: true }).catch(() => undefined)
  }
}

function extractRequestedDomain(request: http.IncomingMessage) {
  const rawHost = (request.headers.host || '').toString().split(':')[0].toLowerCase()
  if (rawHost) return rawHost
  try {
    const url = new URL(request.url || '/', 'http://placeholder')
    return url.hostname
  } catch {
    return ''
  }
}

function createRedirectHandler(request: http.IncomingMessage, response: http.ServerResponse) {
  const requested = extractRequestedDomain(request)
  const normalized = normalizeDomain(requested)
  const matched = normalized && (blockedDomainSet.has(normalized) || Array.from(blockedDomainSet).some((domain) => normalized.endsWith(`.${domain}`)))

  if (matched || requested) {
    mainWindow?.webContents.send('blocker:site-hit', {
      domain: normalized || requested,
      at: Date.now(),
      redirected: Boolean(currentRedirectUrl)
    })
  }

  response.writeHead(302, {
    Location: currentRedirectUrl,
    'Cache-Control': 'no-store'
  })
  response.end(`Redirecting to ${currentRedirectUrl}`)
}

async function startRedirectServer(redirectUrl: string) {
  currentRedirectUrl = normalizeRedirectUrl(redirectUrl)

  if (redirectServer?.listening) {
    return true
  }

  redirectServer = http.createServer(createRedirectHandler)

  return new Promise<boolean>((resolve) => {
    const server = redirectServer
    if (!server) {
      resolve(false)
      return
    }

    let settled = false
    server.once('error', () => {
      if (settled) return
      settled = true
      redirectServer = null
      resolve(false)
    })
    server.listen(80, '127.0.0.1', () => {
      if (settled) return
      settled = true
      resolve(true)
    })
  })
}

async function stopRedirectServer() {
  const server = redirectServer
  redirectServer = null

  if (!server?.listening) return

  await new Promise<void>((resolve) => server.close(() => resolve()))
}

async function applyHostBlock(payload: HostBlockPayload) {
  const domains = Array.isArray(payload) ? payload : payload.domains
  const rawRedirect = Array.isArray(payload) ? '' : (payload.redirectUrl ?? '').trim()
  const hostsPath = getHostsPath()

  if (domains.length === 0) {
    await stopRedirectServer()
    redirectEnabled = false
    blockedDomainSet = new Set()
    return { ok: true, entries: 0, hostsPath, redirectReady: false, redirectUrl: '' }
  }

  const useRedirect = rawRedirect.length > 0
  currentRedirectUrl = useRedirect ? normalizeRedirectUrl(rawRedirect) : ''

  let redirectReady = false
  if (useRedirect) {
    redirectReady = await startRedirectServer(currentRedirectUrl)
    redirectEnabled = redirectReady
  } else {
    await stopRedirectServer()
    redirectEnabled = false
  }

  const target: '0.0.0.0' | '127.0.0.1' = redirectEnabled ? '127.0.0.1' : '0.0.0.0'
  const { hosts, entries } = createHostEntries(domains, target)
  blockedDomainSet = new Set(hosts.map(normalizeDomain).filter(Boolean))

  const content = await fs.readFile(hostsPath, 'utf8')
  const cleaned = stripBlock(content)
  const block = `\n\n${blockStart}\n${entries.join('\n')}\n${blockEnd}\n`
  await fs.writeFile(hostsPath, `${cleaned}${block}`, 'utf8')

  const verifyContent = await fs.readFile(hostsPath, 'utf8')
  if (!verifyContent.includes(blockStart)) {
    return { ok: false, entries: 0, hostsPath, redirectReady, redirectUrl: currentRedirectUrl, error: 'hosts 写入验证失败' }
  }

  await flushDns()
  return { ok: true, entries: entries.length, hostsPath, redirectReady, redirectUrl: currentRedirectUrl }
}

async function clearHostBlock() {
  const hostsPath = getHostsPath()

  try {
    const content = await fs.readFile(hostsPath, 'utf8')
    await fs.writeFile(hostsPath, `${stripBlock(content)}\n`, 'utf8')
  } catch {
    undefined
  }

  await stopRedirectServer()
  redirectEnabled = false
  blockedDomainSet = new Set()
  await flushDns()
  return { ok: true, hostsPath }
}

async function killBlockedApps() {
  const targets = blockedProcessNames

  if (process.platform !== 'win32' || targets.length === 0) {
    return { ok: process.platform === 'win32', killed: 0, targets: targets.length }
  }

  let killed = 0
  await Promise.allSettled(targets.map(async (processName) => {
    try {
      await execFileAsync('tasklist', ['/FI', `IMAGENAME eq ${processName}`, '/NH'], { windowsHide: true })
        .then(({ stdout }) => {
          if (!stdout.toLowerCase().includes(processName.toLowerCase())) {
            throw new Error('not running')
          }
        })
      await execFileAsync('taskkill', ['/F', '/IM', processName], { windowsHide: true })
      killed += 1
      mainWindow?.webContents.send('blocker:app-killed', { processName, at: Date.now() })
    } catch {
      // process not running or kill failed
    }
  }))
  return { ok: true, killed, targets: targets.length }
}

function applyAppBlock(processNames: string[]) {
  blockedProcessNames = Array.from(new Set(processNames.map(normalizeProcessName).filter(Boolean)))

  if (appBlockTimer) {
    clearInterval(appBlockTimer)
    appBlockTimer = null
  }

  if (blockedProcessNames.length === 0) {
    return { ok: true, targets: 0 }
  }

  void killBlockedApps()
  appBlockTimer = setInterval(() => void killBlockedApps(), 3000)
  return { ok: process.platform === 'win32', targets: blockedProcessNames.length }
}

function clearAppBlock() {
  if (appBlockTimer) {
    clearInterval(appBlockTimer)
    appBlockTimer = null
  }
  blockedProcessNames = []
  return { ok: true }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#fff7ed',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  ipcMain.handle('system:get-platform', () => process.platform)
  ipcMain.handle('system:notify', (_event, payload: { title: string; body: string }) => {
    if (Notification.isSupported()) {
      new Notification({ title: payload.title, body: payload.body }).show()
    }
  })
  ipcMain.handle('app:select-exe', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Applications', extensions: ['exe'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const filePath = result.filePaths[0]
    return {
      filePath,
      name: path.basename(filePath).replace(/\.[^.]+$/, ''),
      processName: path.basename(filePath)
    }
  })
  ipcMain.handle('blocker:get-status', () => ({
    hostBlockingReady: process.platform === 'win32',
    appBlockingReady: process.platform === 'win32',
    requiresAdmin: process.platform === 'win32',
    hostsPath: getHostsPath()
  }))
  ipcMain.handle('blocker:apply-hosts', (_event, payload: HostBlockPayload) => applyHostBlock(payload))
  ipcMain.handle('blocker:clear-hosts', () => clearHostBlock())
  ipcMain.handle('blocker:apply-apps', (_event, processNames: string[]) => applyAppBlock(processNames))
  ipcMain.handle('blocker:clear-apps', () => clearAppBlock())

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('before-quit', () => {
  clearHostBlock().catch(() => undefined)
  clearAppBlock()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
