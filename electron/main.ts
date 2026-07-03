import { app, BrowserWindow, ipcMain, Notification, dialog } from 'electron'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged
const execFileAsync = promisify(execFile)
const blockStart = '# Pixel Pomodoro Block Start'
const blockEnd = '# Pixel Pomodoro Block End'

type HostBlockPayload = string[] | { domains: string[] }

let mainWindow: BrowserWindow | null = null
let redirectServer: http.Server | null = null
let sniServer: net.Server | null = null
let appBlockTimer: ReturnType<typeof setInterval> | null = null
let blockedProcessNames: string[] = []
const recentDomainHits = new Map<string, number>()

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

function normalizeProcessName(processName: string) {
  const name = path.basename(processName.trim()).toLowerCase()
  if (!name) return ''
  return process.platform === 'win32' && !name.endsWith('.exe') ? `${name}.exe` : name
}

function createHostEntries(domains: string[]) {
  const hosts = Array.from(new Set(domains.map(normalizeDomain).filter(Boolean).flatMap((domain) => [domain, `www.${domain}`])))
  return { entries: hosts.flatMap((host) => [`127.0.0.1 ${host}`, `::1 ${host}`]) }
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

function reportSiteHit(rawDomain: string) {
  const domain = normalizeDomain(rawDomain)
  if (!domain) return
  const now = Date.now()
  const last = recentDomainHits.get(domain) || 0
  if (now - last < 1500) return
  recentDomainHits.set(domain, now)
  if (recentDomainHits.size > 200) {
    const entries = Array.from(recentDomainHits.entries()).sort((a, b) => a[1] - b[1])
    for (let i = 0; i < 100 && i < entries.length; i += 1) {
      recentDomainHits.delete(entries[i][0])
    }
  }
  mainWindow?.webContents.send('blocker:site-hit', { domain, at: now, redirected: false })
}

function parseSniFromClientHello(buffer: Buffer): string {
  try {
    if (buffer.length < 43 || buffer[0] !== 0x16) return ''
    let offset = 5
    if (buffer[offset] !== 0x01) return ''
    offset += 4
    offset += 2 + 32
    const sessionIdLen = buffer[offset]
    offset += 1 + sessionIdLen
    const cipherLen = buffer.readUInt16BE(offset)
    offset += 2 + cipherLen
    const compressionLen = buffer[offset]
    offset += 1 + compressionLen
    if (offset + 2 > buffer.length) return ''
    const extensionsLen = buffer.readUInt16BE(offset)
    offset += 2
    const extensionsEnd = offset + extensionsLen
    while (offset + 4 <= extensionsEnd && offset + 4 <= buffer.length) {
      const type = buffer.readUInt16BE(offset)
      const size = buffer.readUInt16BE(offset + 2)
      offset += 4
      if (type === 0x0000) {
        const listEnd = offset + size
        offset += 2
        while (offset + 3 <= listEnd) {
          const nameType = buffer[offset]
          const nameLen = buffer.readUInt16BE(offset + 1)
          offset += 3
          if (nameType === 0x00 && offset + nameLen <= buffer.length) {
            return buffer.slice(offset, offset + nameLen).toString('utf8')
          }
          offset += nameLen
        }
        return ''
      }
      offset += size
    }
    return ''
  } catch {
    return ''
  }
}

function createBlockedResponseHandler(request: http.IncomingMessage, response: http.ServerResponse) {
  const requested = extractRequestedDomain(request)
  const normalized = normalizeDomain(requested)
  if (normalized) {
    reportSiteHit(normalized)
  }

  response.writeHead(403, { 'Cache-Control': 'no-store' })
  response.end('Blocked by Pixel Pomodoro')
}

async function startBlockerServers() {
  const httpReady = await ensureHttpServer()
  const sniReady = await ensureSniServer()
  return httpReady || sniReady
}

async function ensureHttpServer() {
  if (redirectServer?.listening) return true

  redirectServer = http.createServer(createBlockedResponseHandler)

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

async function ensureSniServer() {
  if (sniServer?.listening) return true

  sniServer = net.createServer((socket) => {
    socket.setTimeout(3000)
    socket.once('data', (chunk) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      const sni = parseSniFromClientHello(buf)
      if (sni) {
        reportSiteHit(sni)
      }
      socket.end()
    })
    socket.on('timeout', () => socket.destroy())
    socket.on('error', () => undefined)
  })

  return new Promise<boolean>((resolve) => {
    const server = sniServer
    if (!server) {
      resolve(false)
      return
    }
    let settled = false
    server.once('error', () => {
      if (settled) return
      settled = true
      sniServer = null
      resolve(false)
    })
    server.listen(443, '127.0.0.1', () => {
      if (settled) return
      settled = true
      resolve(true)
    })
  })
}

async function stopBlockerServers() {
  const httpServer = redirectServer
  redirectServer = null
  if (httpServer?.listening) {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()))
  }

  const sni = sniServer
  sniServer = null
  if (sni?.listening) {
    await new Promise<void>((resolve) => sni.close(() => resolve()))
  }

  recentDomainHits.clear()
}

async function applyHostBlock(payload: HostBlockPayload) {
  const domains = Array.isArray(payload) ? payload : payload.domains
  const hostsPath = getHostsPath()

  if (domains.length === 0) {
    await stopBlockerServers()
    return { ok: true, entries: 0, hostsPath }
  }

  await startBlockerServers()

  const { entries } = createHostEntries(domains)

  const content = await fs.readFile(hostsPath, 'utf8')
  const cleaned = stripBlock(content)
  const block = `\n\n${blockStart}\n${entries.join('\n')}\n${blockEnd}\n`
  await fs.writeFile(hostsPath, `${cleaned}${block}`, 'utf8')

  const verifyContent = await fs.readFile(hostsPath, 'utf8')
  if (!verifyContent.includes(blockStart)) {
    return { ok: false, entries: 0, hostsPath, error: 'hosts 写入验证失败' }
  }

  await flushDns()
  return { ok: true, entries: entries.length, hostsPath }
}

async function clearHostBlock() {
  const hostsPath = getHostsPath()

  try {
    const content = await fs.readFile(hostsPath, 'utf8')
    await fs.writeFile(hostsPath, `${stripBlock(content)}\n`, 'utf8')
  } catch {
    undefined
  }

  await stopBlockerServers()
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
      nodeIntegration: false,
      backgroundThrottling: false
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
