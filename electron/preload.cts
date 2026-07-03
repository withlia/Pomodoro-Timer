const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('pixelPomodoro', {
  getPlatform: () => ipcRenderer.invoke('system:get-platform'),
  notify: (payload: unknown) => ipcRenderer.invoke('system:notify', payload),
  selectApp: () => ipcRenderer.invoke('app:select-exe'),
  getBlockerStatus: () => ipcRenderer.invoke('blocker:get-status'),
  applyHostBlock: (payload: unknown) => ipcRenderer.invoke('blocker:apply-hosts', payload),
  clearHostBlock: () => ipcRenderer.invoke('blocker:clear-hosts'),
  applyAppBlock: (processNames: unknown) => ipcRenderer.invoke('blocker:apply-apps', processNames),
  clearAppBlock: () => ipcRenderer.invoke('blocker:clear-apps'),
  onAppKilled: (handler: (payload: { processName: string; at: number }) => void) => {
    const listener = (_event: unknown, payload: { processName: string; at: number }) => handler(payload)
    ipcRenderer.on('blocker:app-killed', listener)
    return () => ipcRenderer.removeListener('blocker:app-killed', listener)
  },
  onSiteHit: (handler: (payload: { domain: string; at: number; redirected: boolean }) => void) => {
    const listener = (_event: unknown, payload: { domain: string; at: number; redirected: boolean }) => handler(payload)
    ipcRenderer.on('blocker:site-hit', listener)
    return () => ipcRenderer.removeListener('blocker:site-hit', listener)
  }
})
