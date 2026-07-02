import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('pixelPomodoro', {
  getPlatform: () => ipcRenderer.invoke('system:get-platform'),
  notify: (payload: { title: string; body: string }) => ipcRenderer.invoke('system:notify', payload),
  getBlockerStatus: () => ipcRenderer.invoke('blocker:get-status')
})
