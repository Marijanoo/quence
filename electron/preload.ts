import { contextBridge, ipcRenderer } from 'electron'

async function invoke(channel: string, ...args: any[]) {
  const result = await ipcRenderer.invoke(channel, ...args)
  if (result && !result.ok) throw new Error(result.error)
  return result?.data
}

contextBridge.exposeInMainWorld('electronAPI', {
  makeRequest: (options: any) => ipcRenderer.invoke('make-request', options),
  cancelRequest: (requestId: string) => ipcRenderer.send('cancel-request', { requestId }),
  onRunQuery: (cb: () => void) => {
    ipcRenderer.removeAllListeners('run-query')
    ipcRenderer.on('run-query', cb)
  },
  offRunQuery: () => ipcRenderer.removeAllListeners('run-query'),
  onCloseActiveTab: (cb: () => void) => {
    ipcRenderer.removeAllListeners('close-active-tab')
    ipcRenderer.on('close-active-tab', cb)
  },
  offCloseActiveTab: () => ipcRenderer.removeAllListeners('close-active-tab'),
  onNewQueryTab: (cb: () => void) => {
    ipcRenderer.removeAllListeners('new-query-tab')
    ipcRenderer.on('new-query-tab', cb)
  },
  offNewQueryTab: () => ipcRenderer.removeAllListeners('new-query-tab'),
  onUpdateAvailable: (cb: () => void) => ipcRenderer.on('update-available', cb),
  onUpdateProgress: (cb: (percent: number) => void) => ipcRenderer.on('update-progress', (_e, percent) => cb(percent)),
  onUpdateDownloaded: (cb: () => void) => ipcRenderer.on('update-downloaded', cb),
  installUpdate: () => ipcRenderer.send('install-update'),
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  setIcon: (mode: string) => ipcRenderer.send('window-set-icon', mode),
  zoomIn: () => ipcRenderer.send('window-zoom-in'),
  zoomOut: () => ipcRenderer.send('window-zoom-out'),
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

  db: {
    auth: {
      login:      (email: string, password: string) => invoke('db:auth:login', email, password),
      register:   (email: string, name: string, password: string) => invoke('db:auth:register', email, name, password),
      userExists: (id: string) => invoke('db:auth:userExists', id),
    },
    workspaces: {
      get:    (userId: string) => invoke('db:workspaces:get', userId),
      getOne: (id: string) => invoke('db:workspaces:getOne', id),
      create: (ws: any) => invoke('db:workspaces:create', ws),
      update: (id: string, data: any) => invoke('db:workspaces:update', id, data),
      delete: (id: string) => invoke('db:workspaces:delete', id),
    },
    collections: {
      get:    (workspaceId?: string) => invoke('db:collections:get', workspaceId),
      getOne: (id: string) => invoke('db:collections:getOne', id),
      create: (c: any) => invoke('db:collections:create', c),
      update: (id: string, data: any) => invoke('db:collections:update', id, data),
      delete: (id: string) => invoke('db:collections:delete', id),
    },
    requests: {
      get:    (collectionId?: string) => invoke('db:requests:get', collectionId),
      getOne: (id: string) => invoke('db:requests:getOne', id),
      create: (r: any) => invoke('db:requests:create', r),
      update: (id: string, data: any) => invoke('db:requests:update', id, data),
      delete: (id: string) => invoke('db:requests:delete', id),
    },
    socketConfigs: {
      get:    (collectionId?: string) => invoke('db:socketConfigs:get', collectionId),
      create: (c: any) => invoke('db:socketConfigs:create', c),
      update: (id: string, data: any) => invoke('db:socketConfigs:update', id, data),
      delete: (id: string) => invoke('db:socketConfigs:delete', id),
    },
    sequences: {
      get:    (workspaceId?: string) => invoke('db:sequences:get', workspaceId),
      create: (s: any) => invoke('db:sequences:create', s),
      update: (id: string, data: any) => invoke('db:sequences:update', id, data),
      delete: (id: string) => invoke('db:sequences:delete', id),
    },
    history: {
      get:    (workspaceId?: string, limit?: number) => invoke('db:history:get', workspaceId, limit),
      add:    (entry: any) => invoke('db:history:add', entry),
      clear:  (workspaceId?: string) => invoke('db:history:clear', workspaceId),
      delete: (id: string) => invoke('db:history:delete', id),
    },
    environments: {
      get:       (workspaceId?: string) => invoke('db:environments:get', workspaceId),
      getOne:    (id: string) => invoke('db:environments:getOne', id),
      create:    (env: any) => invoke('db:environments:create', env),
      update:    (id: string, data: any) => invoke('db:environments:update', id, data),
      delete:    (id: string) => invoke('db:environments:delete', id),
      setActive: (id: string | null, workspaceId?: string) => invoke('db:environments:setActive', id, workspaceId),
    },
    workspaceState: {
      get:  (workspaceId: string) => invoke('db:workspaceState:get', workspaceId),
      save: (workspaceId: string, state: any) => invoke('db:workspaceState:save', workspaceId, state),
    },
    invites: {
      forEmail:     (email: string) => invoke('db:invites:forEmail', email),
      forWorkspace: (workspaceId: string) => invoke('db:invites:forWorkspace', workspaceId),
      send:         (invite: any) => invoke('db:invites:send', invite),
      delete:       (id: string) => invoke('db:invites:delete', id),
    },
  },
  pty: {
    create:  (id: string, cols: number, rows: number, cwd?: string) => ipcRenderer.invoke('pty:create', { id, cols, rows, cwd }),
    ready:   (id: string) => ipcRenderer.send('pty:ready', { id }),
    write:   (id: string, data: string) => ipcRenderer.send('pty:write', { id, data }),
    line:    (id: string, line: string) => ipcRenderer.send('pty:line', { id, line }),
    resize:  (id: string, cols: number, rows: number) => ipcRenderer.send('pty:resize', { id, cols, rows }),
    kill:    (id: string) => ipcRenderer.invoke('pty:kill', { id }),
    popout:  (id: string, title: string) => ipcRenderer.invoke('pty:popout', { id, title }),
    homedir: () => ipcRenderer.invoke('pty:homedir'),
    onData:  (id: string, cb: (data: string) => void) => ipcRenderer.on(`pty:data:${id}`, (_e, data) => cb(data)),
    onExit:  (id: string, cb: () => void) => ipcRenderer.on(`pty:exit:${id}`, cb),
    offData: (id: string) => ipcRenderer.removeAllListeners(`pty:data:${id}`),
    offExit: (id: string) => ipcRenderer.removeAllListeners(`pty:exit:${id}`),
    stats:   (ids: string[]) => ipcRenderer.invoke('pty:stats', { ids }),
    onPopoutClosed: (cb: (id: string) => void) => ipcRenderer.on('pty:popout-closed', (_e, id) => cb(id)),
    onPopIn:        (cb: (id: string) => void) => ipcRenderer.on('pty:popin', (_e, id) => cb(id)),
    popIn:          (id: string) => ipcRenderer.send('pty:popin', { id }),
  },
  pg: {
    connect:         (opts: any) => ipcRenderer.invoke('pg:connect', opts),
    disconnect:      (id: string) => ipcRenderer.invoke('pg:disconnect', { id }),
    query:           (id: string, sql: string, database?: string) => ipcRenderer.invoke('pg:query', { id, sql, database }),
    introspect:      (id: string) => ipcRenderer.invoke('pg:introspect', { id }),
    introspectDb:    (id: string, database: string) => ipcRenderer.invoke('pg:introspect-db', { id, database }),
    selectOvpnFile:  () => ipcRenderer.invoke('pg:select-ovpn-file'),
  },

  mysql: {
    connect:      (opts: { id: string; host: string; port: number; database: string; user: string; password: string; ssl: boolean; vpnConfigPath?: string; vpnUsername?: string; vpnPassword?: string }) => ipcRenderer.invoke('mysql:connect', opts),
    disconnect:   (id: string) => ipcRenderer.invoke('mysql:disconnect', { id }),
    query:        (id: string, sql: string, database?: string) => ipcRenderer.invoke('mysql:query', { id, sql, database }),
    introspect:   (id: string) => ipcRenderer.invoke('mysql:introspect', { id }),
    introspectDb: (id: string, database: string) => ipcRenderer.invoke('mysql:introspect-db', { id, database }),
  },
})
