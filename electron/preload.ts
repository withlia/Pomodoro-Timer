import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('pixelPomodoro', {
  getPlatform: () => ipcRenderer.invoke('system:get-platform'),
  notify: (payload: { title: string; body: string }) => ipcRenderer.invoke('system:notify', payload),
  getBlockerStatus: () => ipcRenderer.invoke('blocker:get-status'),
  applyHostBlock: (payload: { domains: string[]; redirectUrl?: string }) => ipcRenderer.invoke('blocker:apply-hosts', payload),
  clearHostBlock: () => ipcRenderer.invoke('blocker:clear-hosts'),
  applyAppBlock: (processNames: string[]) => ipcRenderer.invoke('blocker:apply-apps', processNames),
  clearAppBlock: () => ipcRenderer.invoke('blocker:clear-apps')
})
