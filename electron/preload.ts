import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  makeRequest: (options: any) => ipcRenderer.invoke('make-request', options),
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  wsConnect: (socketId: string, url: string, headers?: Record<string, string>, protocol?: string) =>
    ipcRenderer.send('ws-connect', { socketId, url, headers, protocol }),
  wsSend: (socketId: string, data: string) =>
    ipcRenderer.send('ws-send', { socketId, data }),
  wsDisconnect: (socketId: string) =>
    ipcRenderer.send('ws-disconnect', { socketId }),
  wsOnOpen: (cb: (socketId: string) => void) =>
    ipcRenderer.on('ws-open', (_e, { socketId }) => cb(socketId)),
  wsOnMessage: (cb: (socketId: string, data: string, isBinary: boolean) => void) =>
    ipcRenderer.on('ws-message', (_e, { socketId, data, isBinary }) => cb(socketId, data, isBinary)),
  wsOnClose: (cb: (socketId: string, code: number, reason: string) => void) =>
    ipcRenderer.on('ws-close', (_e, { socketId, code, reason }) => cb(socketId, code, reason)),
  wsOnError: (cb: (socketId: string, message: string) => void) =>
    ipcRenderer.on('ws-error', (_e, { socketId, message }) => cb(socketId, message)),
  wsRemoveListeners: () => {
    ipcRenderer.removeAllListeners('ws-open')
    ipcRenderer.removeAllListeners('ws-message')
    ipcRenderer.removeAllListeners('ws-close')
    ipcRenderer.removeAllListeners('ws-error')
  },
})
