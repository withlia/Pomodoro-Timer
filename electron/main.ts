import { app, BrowserWindow, ipcMain, Notification, dialog } from 'electron'
import { execFile, spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged
const execFileAsync = promisify(execFile)

type HostBlockPayload = string[] | { domains: string[] }
type ProxyBackup = { enable: string; server: string; override: string; connPerServer: string }

const PROXY_HOST = '127.0.0.1'
const PROXY_PORT = 8878
const INTERNET_SETTINGS_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'
const BACKUP_FILE = 'pixel-pomodoro-proxy-backup.json'

let mainWindow: BrowserWindow | null = null
let proxyServer: http.Server | null = null
let appBlockTimer: ReturnType<typeof setInterval> | null = null
let blockedProcessNames: string[] = []
let blockedDomainSet = new Set<string>()
let originalProxy: ProxyBackup | null = null
let proxyApplied = false
const recentDomainHits = new Map<string, number>()

function normalizeDomain(domain: string) {
  return domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').replace(/:\d+$/, '').replace(/^\.+|\.+$/g, '')
}

function normalizeProcessName(processName: string) {
  const name = path.basename(processName.trim()).toLowerCase()
  if (!name) return ''
  return process.platform === 'win32' && !name.endsWith('.exe') ? `${name}.exe` : name
}

function isHostBlocked(host: string) {
  const h = host.split(':')[0].toLowerCase().replace(/^www\./, '')
  if (blockedDomainSet.has(h)) return true
  const parts = h.split('.')
  for (let i = 1; i < parts.length; i += 1) {
    if (blockedDomainSet.has(parts.slice(i).join('.'))) return true
  }
  return false
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
    for (let i = 0; i < 100 && i < entries.length; i += 1) recentDomainHits.delete(entries[i][0])
  }
  mainWindow?.webContents.send('blocker:site-hit', { domain, at: now, redirected: true })
}

function createProxyRequestHandler(request: http.IncomingMessage, response: http.ServerResponse) {
  const hostHeader = (request.headers.host || '').toString()
  const host = hostHeader.split(':')[0].toLowerCase()
  if (host && isHostBlocked(host)) {
    reportSiteHit(host)
    response.writeHead(403, { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('Blocked by Pixel Pomodoro')
    return
  }
  const options: http.RequestOptions = { method: request.method, host, port: Number(hostHeader.split(':')[1] || 80), path: request.url, headers: request.headers }
  const proxyReq = http.request(options, (proxyRes) => {
    response.writeHead(proxyRes.statusCode || 200, proxyRes.headers)
    proxyRes.pipe(response)
  })
  proxyReq.on('error', () => {
    if (!response.headersSent) { response.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end('Proxy error') } else { response.destroy() }
  })
  request.pipe(proxyReq)
}

function handleConnect(req: http.IncomingMessage, socket: net.Socket) {
  const hostPort = (req.url || '').split(':')
  const host = (hostPort[0] || '').toLowerCase()
  if (host && isHostBlocked(host)) {
    reportSiteHit(host)
    socket.write('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n')
    socket.end()
    return
  }
  const port = Number(hostPort[1] || 443)
  const upstream = net.connect(port, host, () => {
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
    upstream.pipe(socket)
    socket.pipe(upstream)
  })
  upstream.on('error', () => socket.destroy())
  socket.on('error', () => upstream.destroy())
}

async function startProxyServer(): Promise<{ ok: boolean; error?: string }> {
  if (proxyServer?.listening) return { ok: true }
  proxyServer = http.createServer(createProxyRequestHandler)
  proxyServer.on('connect', handleConnect)
  return new Promise((resolve) => {
    const server = proxyServer
    if (!server) { resolve({ ok: false, error: '无法创建代理服务' }); return }
    let settled = false
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (settled) return
      settled = true
      proxyServer = null
      resolve({ ok: false, error: err.code === 'EADDRINUSE' ? `${PROXY_PORT} 端口已被占用` : err.message })
    })
    server.listen(PROXY_PORT, PROXY_HOST, () => { if (settled) return; settled = true; resolve({ ok: true }) })
  })
}

async function stopProxyServer() {
  const server = proxyServer
  proxyServer = null
  if (server?.listening) await new Promise<void>((resolve) => server.close(() => resolve()))
  recentDomainHits.clear()
}

function regQuery(key: string, value: string): string | null {
  try {
    const r = spawnSync('reg', ['query', key, '/v', value], { windowsHide: true, encoding: 'utf8' })
    if (r.status !== 0) return null
    const m = r.stdout.match(new RegExp(`${value}\s+REG_[A-Z_]+\s+(.*)`))
    return m ? m[1].trim() : null
  } catch { return null }
}

function regSet(key: string, value: string, type: string, data: string): boolean {
  try { const r = spawnSync('reg', ['add', key, '/v', value, '/t', type, '/d', data, '/f'], { windowsHide: true }); return r.status === 0 } catch { return false }
}

function readProxyState(): ProxyBackup {
  return {
    enable: regQuery(INTERNET_SETTINGS_KEY, 'ProxyEnable') || '0',
    server: regQuery(INTERNET_SETTINGS_KEY, 'ProxyServer') || '',
    override: regQuery(INTERNET_SETTINGS_KEY, 'ProxyOverride') || '',
    connPerServer: regQuery(INTERNET_SETTINGS_KEY, 'ProxyConnectionEnable') || regQuery(INTERNET_SETTINGS_KEY, 'ProxyEnable') || '0'
  }
}

function notifyProxyChange() {
  if (process.platform !== 'win32') return
  const ps = `$sig = '[DllImport("wininet.dll", SetLastError=true)] public static extern bool InternetSetOptionW(IntPtr hInternet, int dwOption, IntPtr lpBuffer, int dwBufferLength);'; $t = Add-Type -MemberDefinition $sig -Name WinINet -Namespace PInvoke -PassThru; $p = [Runtime.InteropServices.Marshal]::AllocHGlobal(4); try { [void]$t::InternetSetOptionW([IntPtr]::Zero, 39, $p, 4); [void]$t::InternetSetOptionW([IntPtr]::Zero, 37, $p, 4) } finally { [Runtime.InteropServices.Marshal]::FreeHGlobal($p) }`
  try { spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], { windowsHide: true, timeout: 8000 }) } catch { /* ignore */ }
}

async function applySystemProxy() {
  if (process.platform !== 'win32') return false
  if (!originalProxy) {
    originalProxy = readProxyState()
    try { const p = path.join(app.getPath('userData'), BACKUP_FILE); await fs.writeFile(p, JSON.stringify(originalProxy), 'utf8') } catch { /* ignore */ }
  }
  const okServer = regSet(INTERNET_SETTINGS_KEY, 'ProxyServer', 'REG_SZ', `${PROXY_HOST}:${PROXY_PORT}`)
  regSet(INTERNET_SETTINGS_KEY, 'ProxyOverride', 'REG_SZ', 'localhost;127.*;10.*;192.168.*;172.16.*;172.17.*;172.18.*;172.19.*;172.20.*;172.21.*;172.22.*;172.23.*;172.24.*;172.25.*;172.26.*;172.27.*;172.28.*;172.29.*;172.30.*;172.31.*;<local>')
  const okEnable = regSet(INTERNET_SETTINGS_KEY, 'ProxyEnable', 'REG_DWORD', '1')
  const okConn = regSet(INTERNET_SETTINGS_KEY, 'ProxyConnectionEnable', 'REG_DWORD', '1')
  notifyProxyChange()
  proxyApplied = okServer && okEnable && okConn
  return proxyApplied
}
async function restoreSystemProxy() {
  if (process.platform !== 'win32') return
  const backup = originalProxy || readProxyState()
  regSet(INTERNET_SETTINGS_KEY, 'ProxyServer', 'REG_SZ', backup.server)
  regSet(INTERNET_SETTINGS_KEY, 'ProxyOverride', 'REG_SZ', backup.override)
  regSet(INTERNET_SETTINGS_KEY, 'ProxyEnable', 'REG_DWORD', backup.enable === '1' ? '1' : '0')
  regSet(INTERNET_SETTINGS_KEY, 'ProxyConnectionEnable', 'REG_DWORD', backup.connPerServer === '1' ? '1' : '0')
  notifyProxyChange()
  proxyApplied = false
  originalProxy = null
  try { const p = path.join(app.getPath('userData'), BACKUP_FILE); if (fsSync.existsSync(p)) await fs.unlink(p) } catch { /* ignore */ }
}

async function recoverProxyIfNeeded() {
  if (process.platform !== 'win32') return
  try {
    const p = path.join(app.getPath('userData'), BACKUP_FILE)
    if (!fsSync.existsSync(p)) return
    const data = JSON.parse(await fs.readFile(p, 'utf8')) as ProxyBackup
    originalProxy = data
    await restoreSystemProxy()
  } catch { /* ignore */ }
}

async function applyHostBlock(payload: HostBlockPayload) {
  const domains = Array.isArray(payload) ? payload : payload.domains
  const cleaned = Array.from(new Set(domains.map(normalizeDomain).filter(Boolean)))
  blockedDomainSet = new Set(cleaned.flatMap((d) => [d, `www.${d}`]))
  if (cleaned.length === 0) {
    await stopProxyServer()
    if (proxyApplied) await restoreSystemProxy()
    return { ok: true, entries: 0, hostsPath: 'proxy' }
  }
  const serverResult = await startProxyServer()
  if (!serverResult.ok) return { ok: false, entries: 0, hostsPath: 'proxy', error: serverResult.error || '代理服务启动失败' }
  const ok = await applySystemProxy()
  if (!ok) return { ok: false, entries: 0, hostsPath: 'proxy', error: '设置系统代理失败' }
  return { ok: true, entries: cleaned.length, hostsPath: 'proxy' }
}

async function clearHostBlock() {
  blockedDomainSet = new Set()
  await stopProxyServer()
  if (proxyApplied) await restoreSystemProxy()
  return { ok: true, hostsPath: 'proxy' }
}

async function killBlockedApps() {
  const targets = blockedProcessNames
  if (process.platform !== 'win32' || targets.length === 0) return { ok: process.platform === 'win32', killed: 0, targets: targets.length }
  let killed = 0
  await Promise.allSettled(targets.map(async (processName) => {
    try {
      await execFileAsync('tasklist', ['/FI', `IMAGENAME eq ${processName}`, '/NH'], { windowsHide: true }).then(({ stdout }) => { if (!stdout.toLowerCase().includes(processName.toLowerCase())) throw new Error('not running') })
      await execFileAsync('taskkill', ['/F', '/IM', processName], { windowsHide: true })
      killed += 1
      mainWindow?.webContents.send('blocker:app-killed', { processName, at: Date.now() })
    } catch { /* user-owned processes work without admin */ }
  }))
  return { ok: true, killed, targets: targets.length }
}

function applyAppBlock(processNames: string[]) {
  blockedProcessNames = Array.from(new Set(processNames.map(normalizeProcessName).filter(Boolean)))
  if (appBlockTimer) { clearInterval(appBlockTimer); appBlockTimer = null }
  if (blockedProcessNames.length === 0) return { ok: true, targets: 0 }
  if (process.platform !== 'win32') return { ok: false, targets: 0, error: '当前平台不支持进程屏蔽' }
  void killBlockedApps()
  appBlockTimer = setInterval(() => void killBlockedApps(), 3000)
  return { ok: true, targets: blockedProcessNames.length }
}

function clearAppBlock() {
  if (appBlockTimer) { clearInterval(appBlockTimer); appBlockTimer = null }
  blockedProcessNames = []
  return { ok: true }
}

function resolveIconPath() {
  const candidates = isDev
    ? [path.join(__dirname, '../build/icon.ico'), path.join(__dirname, '../build/icon.png')]
    : [path.join(process.resourcesPath, 'icon.ico'), path.join(process.resourcesPath, 'icon.png'), path.join(__dirname, '../build/icon.ico'), path.join(__dirname, '../build/icon.png')]
  for (const candidate of candidates) { if (fsSync.existsSync(candidate)) return candidate }
  return undefined
}

function createWindow() {
  const iconPath = resolveIconPath()
  mainWindow = new BrowserWindow({
    width: 1180, height: 760, minWidth: 960, minHeight: 640, backgroundColor: '#fff7ed',
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
  })
  if (isDev) mainWindow.loadURL('http://localhost:5173')
  else mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
}

app.whenReady().then(async () => {
  await recoverProxyIfNeeded()
  ipcMain.handle('system:get-platform', () => process.platform)
  ipcMain.handle('system:notify', (_event, payload: { title: string; body: string }) => { if (Notification.isSupported()) new Notification({ title: payload.title, body: payload.body }).show() })
  ipcMain.handle('app:select-exe', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Applications', extensions: ['exe'] }] })
    if (result.canceled || result.filePaths.length === 0) return null
    const filePath = result.filePaths[0]
    return { filePath, name: path.basename(filePath).replace(/\.[^.]+$/, ''), processName: path.basename(filePath) }
  })
  ipcMain.handle('blocker:get-status', () => ({ hostBlockingReady: process.platform === 'win32', appBlockingReady: process.platform === 'win32', requiresAdmin: false, elevated: false, hostsPath: 'proxy' }))
  ipcMain.handle('blocker:request-elevation', async () => ({ ok: true }))
  ipcMain.handle('blocker:apply-hosts', (_event, payload: HostBlockPayload) => applyHostBlock(payload))
  ipcMain.handle('blocker:clear-hosts', () => clearHostBlock())
  ipcMain.handle('blocker:apply-apps', (_event, processNames: string[]) => applyAppBlock(processNames))
  ipcMain.handle('blocker:clear-apps', () => clearAppBlock())
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('before-quit', () => { clearHostBlock().catch(() => undefined); clearAppBlock() })
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
