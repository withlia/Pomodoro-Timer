const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('pixelPomodoro', {
  getPlatform: () => ipcRenderer.invoke('system:get-platform'),
  notify: (payload: unknown) => ipcRenderer.invoke('system:notify', payload),
  selectApp: () => ipcRenderer.invoke('app:select-exe'),
  getBlockerStatus: () => ipcRenderer.invoke('blocker:get-status'),
  applyHostBlock: (payload: unknown) => ipcRenderer.invoke('blocker:apply-hosts', payload),
  clearHostBlock: () => ipcRenderer.invoke('blocker:clear-hosts'),
  applyAppBlock: (processNames: unknown) => ipcRenderer.invoke('blocker:apply-apps', processNames),
  clearAppBlock: () => ipcRenderer.invoke('blocker:clear-apps')
})
