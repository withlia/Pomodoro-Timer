import { app, BrowserWindow, dialog, ipcMain, Notification } from 'electron'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged
const execFileAsync = promisify(execFile)
const blockStart = '# Pixel Pomodoro Block Start'
const blockEnd = '# Pixel Pomodoro Block End'

let mainWindow: BrowserWindow | null = null

function getHostsPath() {
  if (process.platform === 'win32') {
    return 'C:\\Windows\\System32\\drivers\\etc\\hosts'
  }
  return '/etc/hosts'
}

function normalizeDomain(domain: string) {
  return domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')
}

function createHostEntries(domains: string[]) {
  const entries = Array.from(new Set(domains.map(normalizeDomain).filter(Boolean)))
  return entries.flatMap((domain) => [`0.0.0.0 ${domain}`, `0.0.0.0 www.${domain}`])
}

function stripBlock(content: string) {
  const pattern = new RegExp(`\\r?\\n?${blockStart}[\\s\\S]*?${blockEnd}\\r?\\n?`, 'g')
  return content.replace(pattern, '').trimEnd()
}

async function flushDns() {
  if (process.platform === 'win32') {
    await execFileAsync('ipconfig', ['/flushdns']).catch(() => undefined)
  }
}

async function applyHostBlock(domains: string[]) {
  const hostsPath = getHostsPath()
  const content = await fs.readFile(hostsPath, 'utf8')
  const cleaned = stripBlock(content)
  const entries = createHostEntries(domains)
  const block = entries.length ? `\n\n${blockStart}\n${entries.join('\n')}\n${blockEnd}\n` : '\n'
  await fs.writeFile(hostsPath, `${cleaned}${block}`, 'utf8')
  await flushDns()
  return { ok: true, entries: entries.length, hostsPath }
}

async function clearHostBlock() {
  const hostsPath = getHostsPath()
  const content = await fs.readFile(hostsPath, 'utf8')
  await fs.writeFile(hostsPath, `${stripBlock(content)}\n`, 'utf8')
  await flushDns()
  return { ok: true, hostsPath }
}

async function selectAppFile() {
  const options = {
    title: '选择要屏蔽的应用',
    properties: ['openFile'] as Array<'openFile'>,
    filters: process.platform === 'win32'
      ? [{ name: '应用程序', extensions: ['exe'] }]
      : [{ name: '应用程序', extensions: ['app', '*'] }]
  }
  const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options)

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  const filePath = result.filePaths[0]
  const parsed = path.parse(filePath)
  return {
    name: parsed.name,
    processName: parsed.base,
    filePath
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#fff7ed',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
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
  ipcMain.handle('blocker:get-status', () => ({
    hostBlockingReady: process.platform === 'win32',
    appBlockingReady: true,
    requiresAdmin: process.platform === 'win32',
    hostsPath: getHostsPath()
  }))
  ipcMain.handle('blocker:apply-hosts', (_event, domains: string[]) => applyHostBlock(domains))
  ipcMain.handle('blocker:clear-hosts', () => clearHostBlock())
  ipcMain.handle('blocker:select-app', () => selectAppFile())

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('before-quit', () => {
  clearHostBlock().catch(() => undefined)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
