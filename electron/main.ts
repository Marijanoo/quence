import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { Pool } from 'pg'
import * as mysql from 'mysql2/promise'
import * as path from 'path'
import * as fs from 'fs'
import { spawn, ChildProcess } from 'child_process'
import * as pty from 'node-pty'
import * as os from 'os'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pidusage = require('pidusage') as (pids: number | number[]) => Promise<Record<number, { cpu: number; memory: number }>>
import serve from 'electron-serve'
import WebSocket from 'ws'
import { io as ioClient } from 'socket.io-client'
import { autoUpdater } from 'electron-updater'
import {
  dbLogin, dbRegister, dbUserExists,
  dbGetWorkspace, dbGetWorkspaces, dbCreateWorkspace, dbUpdateWorkspace, dbDeleteWorkspace,
  dbGetCollections, dbGetCollection, dbCreateCollection, dbUpdateCollection, dbDeleteCollection,
  dbGetRequests, dbGetRequest, dbCreateRequest, dbUpdateRequest, dbDeleteRequest,
  dbGetSocketConfigs, dbCreateSocketConfig, dbUpdateSocketConfig, dbDeleteSocketConfig,
  dbGetSequences, dbCreateSequence, dbUpdateSequence, dbDeleteSequence,
  dbGetHistory, dbAddToHistory, dbClearHistory, dbDeleteHistoryEntry,
  dbGetEnvironments, dbGetEnvironment, dbCreateEnvironment, dbUpdateEnvironment, dbDeleteEnvironment, dbSetActiveEnvironment,
  dbGetWorkspaceState, dbSaveWorkspaceState,
  dbGetInvitesForEmail, dbGetInvitesForWorkspace, dbSendInvite, dbDeleteInvite,
} from './sqlite-db'

// Swallow EPIPE errors from node-pty ConPTY pipe teardown — these are harmless
process.on('uncaughtException', (err: any) => {
  if (err?.code === 'EPIPE') return
  throw err
})

const isProd = app.isPackaged || process.env.NODE_ENV === 'production'

if (isProd) {
  serve({ directory: 'out' })
} else {
  app.setPath('userData', `${app.getPath('userData')} (development)`)
}

let mainWindow: BrowserWindow | null = null

function getWindowStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json')
}

function loadWindowState(): { width: number; height: number; x?: number; y?: number; isMaximized?: boolean } {
  try {
    const raw = fs.readFileSync(getWindowStatePath(), 'utf-8')
    return JSON.parse(raw)
  } catch {
    return { width: 1200, height: 800 }
  }
}

function saveWindowState() {
  if (!mainWindow) return
  try {
    const isMaximized = mainWindow.isMaximized()
    let bounds: { width: number; height: number; x?: number; y?: number; isMaximized?: boolean } = { width: 1200, height: 800 }
    try {
      const raw = fs.readFileSync(getWindowStatePath(), 'utf-8')
      bounds = JSON.parse(raw)
    } catch {}

    if (!isMaximized) {
      const currentBounds = mainWindow.getBounds()
      bounds.x = currentBounds.x
      bounds.y = currentBounds.y
      bounds.width = currentBounds.width
      bounds.height = currentBounds.height
    }
    bounds.isMaximized = isMaximized
    fs.writeFileSync(getWindowStatePath(), JSON.stringify(bounds))
  } catch {}
}

async function createWindow() {
  const windowState = loadWindowState()
  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: 600,
    minHeight: 400,
    frame: false,
    show: false,
    icon: path.join(__dirname, '..', 'public', process.platform === 'win32' ? 'logo.ico' : 'logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  if (windowState.isMaximized) {
    mainWindow.maximize()
  }
  mainWindow.show()

  if (isProd) {
    await mainWindow.loadURL('app://-')
  } else {
    const port = process.argv[2] || 3000

    // Next.js HMR builds a relative WebSocket URL that Chrome parses as having
    // "_next" as the hostname. Intercept those requests and redirect them to
    // the actual dev server before they hit the network.
    mainWindow.webContents.session.webRequest.onBeforeRequest(
      { urls: ['ws://_next/*', 'wss://_next/*'] },
      (details, callback) => {
        callback({
          redirectURL: details.url.replace(
            /^wss?:\/\/_next\//,
            `ws://localhost:${port}/_next/`
          ),
        })
      }
    )

    await mainWindow.loadURL(`http://localhost:${port}`)
  }

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    if (input.key === 'F12') {
      if (!isProd) mainWindow!.webContents.toggleDevTools()
      event.preventDefault()
    } else if ((input.control || input.meta) && (input.key === 'r' || input.key === 'R')) {
      // Block Ctrl/Cmd+R page reload — renderer handles it as "run query"
      event.preventDefault()
      mainWindow!.webContents.send('run-query')
    } else if ((input.control || input.meta) && (input.key === 'w' || input.key === 'W')) {
      event.preventDefault()
      mainWindow!.webContents.send('close-active-tab')
    } else if ((input.control || input.meta) && (input.key === 't' || input.key === 'T')) {
      event.preventDefault()
      mainWindow!.webContents.send('new-query-tab')
    } else if ((input.control || input.meta) && (input.key === '=' || input.key === '+')) {
      const currentZoom = mainWindow!.webContents.getZoomLevel()
      mainWindow!.webContents.setZoomLevel(currentZoom + 0.5)
      event.preventDefault()
    } else if ((input.control || input.meta) && input.key === '-') {
      const currentZoom = mainWindow!.webContents.getZoomLevel()
      mainWindow!.webContents.setZoomLevel(currentZoom - 0.5)
      event.preventDefault()
    } else if ((input.control || input.meta) && input.key === '0') {
      mainWindow!.webContents.setZoomLevel(0)
      event.preventDefault()
    }
  })

  // Block all renderer-initiated reloads (Ctrl+R, Ctrl+Shift+R, F5)
  mainWindow.webContents.on('will-reload' as any, (event: Electron.Event) => {
    event.preventDefault()
  })

  mainWindow.on('resize', saveWindowState)
  mainWindow.on('move', saveWindowState)
  mainWindow.on('closed', () => {
    saveWindowState()
    mainWindow = null
  })
}

app.on('ready', () => {
  createWindow()

  ipcMain.on('window-minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize())
  ipcMain.on('window-maximize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })
  ipcMain.on('window-close', (e) => BrowserWindow.fromWebContents(e.sender)?.close())
  ipcMain.on('window-set-icon', (_e, mode: string) => {
    if (!mainWindow) return
    const iconFile = mode === 'database'
      ? (process.platform === 'win32' ? 'QuenceDB.ico' : 'QuenceDB.png')
      : mode === 'terminal'
      ? (process.platform === 'win32' ? 'QuenceTN.ico' : 'QuenceTN.png')
      : (process.platform === 'win32' ? 'logo.ico' : 'logo.png')
    try { mainWindow.setIcon(path.join(__dirname, '..', 'public', iconFile)) } catch {}
  })
  ipcMain.on('window-zoom-in', () => {
    if (!mainWindow) return
    mainWindow.webContents.setZoomLevel(mainWindow.webContents.getZoomLevel() + 0.5)
  })
  ipcMain.on('window-zoom-out', () => {
    if (!mainWindow) return
    mainWindow.webContents.setZoomLevel(mainWindow.webContents.getZoomLevel() - 0.5)
  })

  // ── WebSocket proxy ─────────────────────────────────────────────────────────
  type SocketHandle = { send: (data: string) => void; close: () => void }
  const sockets = new Map<string, SocketHandle>()

  ipcMain.on('ws-connect', (event, { socketId, url, headers, protocol }: { socketId: string; url: string; headers?: Record<string, string>; protocol?: string }) => {
    if (sockets.has(socketId)) return
    // Capture sender once — event.sender can go stale after the handler returns
    const sender = event.sender

    if (protocol === 'socketio') {
      // Socket.IO: use socket.io-client so the EIO handshake and polling→ws upgrade work correctly
      const socket = ioClient(url, {
        transports: ['polling', 'websocket'],
        extraHeaders: headers ?? {},
        reconnection: false,
        ackTimeout: 30000,
      })
      sockets.set(socketId, {
        send: (data: string) => {
          try {
            const parsed = JSON.parse(data)
            if (parsed?.__ack === true) {
              socket.emit(parsed.event, parsed.data, (...ackArgs: any[]) => {
                const ackData = ackArgs.length === 1 ? ackArgs[0] : ackArgs
                const payload = typeof ackData === 'string' ? ackData : JSON.stringify(ackData)
                sender.send('ws-message', { socketId, data: JSON.stringify(['__ack__', payload]), isBinary: false })
              })
              return
            }
            if (Array.isArray(parsed) && typeof parsed[0] === 'string') {
              const [eventName, ...args] = parsed
              socket.emit(eventName, ...args)
              return
            }
          } catch { /* */ }
          socket.emit('message', data)
        },
        close: () => socket.disconnect(),
      })

      socket.on('connect', () => sender.send('ws-open', { socketId }))

      socket.onAny((eventName: string, ...args: any[]) => {
        const data = JSON.stringify([eventName, ...args])
        sender.send('ws-message', { socketId, data, isBinary: false })
      })

      socket.on('disconnect', (reason: string) => {
        sockets.delete(socketId)
        sender.send('ws-close', { socketId, code: 1000, reason })
      })

      socket.on('connect_error', (err: Error) => {
        sockets.delete(socketId)
        sender.send('ws-error', { socketId, message: err.message })
        socket.disconnect()
      })
    } else {
      // Raw WebSocket
      let origin = ''
      let host = ''
      try {
        const u = new URL(url.replace(/^wss?:\/\//, 'https://'))
        origin = u.origin
        host = u.host
      } catch { /* */ }
      const mergedHeaders = { Host: host, Origin: origin, ...headers }
      const ws = new WebSocket(url, { headers: mergedHeaders, perMessageDeflate: false })
      sockets.set(socketId, { send: (data) => ws.send(data), close: () => ws.close() })

      ws.on('open', () => sender.send('ws-open', { socketId }))
      ws.on('message', (data) => {
        const text = Buffer.isBuffer(data) ? data.toString('base64') : data.toString()
        const isBinary = Buffer.isBuffer(data)
        sender.send('ws-message', { socketId, data: text, isBinary })
      })
      ws.on('close', (code, reason) => {
        sockets.delete(socketId)
        sender.send('ws-close', { socketId, code, reason: reason.toString() })
      })
      ws.on('unexpected-response', (_req, res) => {
        let body = ''
        res.on('data', (chunk: Buffer) => { body += chunk.toString() })
        res.on('end', () => {
          const msg = `Unexpected server response: ${res.statusCode} ${res.statusMessage}\nHeaders: ${JSON.stringify(res.headers, null, 2)}\nBody: ${body}`
          console.error('[ws-connect unexpected-response]', msg)
          sender.send('ws-error', { socketId, message: msg })
        })
      })
      ws.on('error', (err) => {
        console.error('[ws-connect error]', err)
        sender.send('ws-error', { socketId, message: err.message })
      })
    }
  })

  ipcMain.on('ws-send', (_event, { socketId, data }: { socketId: string; data: string }) => {
    sockets.get(socketId)?.send(data)
  })

  ipcMain.on('ws-disconnect', (_event, { socketId }: { socketId: string }) => {
    sockets.get(socketId)?.close()
    sockets.delete(socketId)
  })

  // ── Database IPC ────────────────────────────────────────────────────────────
  const handle = (ch: string, fn: (...args: any[]) => Promise<any>) =>
    ipcMain.handle(ch, async (_e, ...args) => {
      try { return { ok: true, data: await fn(...args) } }
      catch (err: any) { return { ok: false, error: err.message ?? String(err) } }
    })

  handle('db:auth:login',       (email, password) => dbLogin(email, password))
  handle('db:auth:register',    (email, name, password) => dbRegister(email, name, password))
  handle('db:auth:userExists',  (id) => dbUserExists(id))

  handle('db:workspaces:get',    (userId) => dbGetWorkspaces(userId))
  handle('db:workspaces:getOne', (id) => dbGetWorkspace(id))
  handle('db:workspaces:create', (ws) => dbCreateWorkspace(ws))
  handle('db:workspaces:update', (id, data) => dbUpdateWorkspace(id, data))
  handle('db:workspaces:delete', (id) => dbDeleteWorkspace(id))

  handle('db:collections:get',    (workspaceId) => dbGetCollections(workspaceId))
  handle('db:collections:getOne', (id) => dbGetCollection(id))
  handle('db:collections:create', (c) => dbCreateCollection(c))
  handle('db:collections:update', (id, data) => dbUpdateCollection(id, data))
  handle('db:collections:delete', (id) => dbDeleteCollection(id))

  handle('db:requests:get',    (collectionId) => dbGetRequests(collectionId))
  handle('db:requests:getOne', (id) => dbGetRequest(id))
  handle('db:requests:create', (r) => dbCreateRequest(r))
  handle('db:requests:update', (id, data) => dbUpdateRequest(id, data))
  handle('db:requests:delete', (id) => dbDeleteRequest(id))

  handle('db:socketConfigs:get',    (collectionId) => dbGetSocketConfigs(collectionId))
  handle('db:socketConfigs:create', (c) => dbCreateSocketConfig(c))
  handle('db:socketConfigs:update', (id, data) => dbUpdateSocketConfig(id, data))
  handle('db:socketConfigs:delete', (id) => dbDeleteSocketConfig(id))

  handle('db:sequences:get',    (collectionId) => dbGetSequences(collectionId))
  handle('db:sequences:create', (s) => dbCreateSequence(s))
  handle('db:sequences:update', (id, data) => dbUpdateSequence(id, data))
  handle('db:sequences:delete', (id) => dbDeleteSequence(id))

  handle('db:history:get',         (workspaceId, limit) => dbGetHistory(workspaceId, limit))
  handle('db:history:add',         (entry) => dbAddToHistory(entry))
  handle('db:history:clear',       (workspaceId) => dbClearHistory(workspaceId))
  handle('db:history:delete',      (id) => dbDeleteHistoryEntry(id))

  handle('db:environments:get',       (workspaceId) => dbGetEnvironments(workspaceId))
  handle('db:environments:getOne',    (id) => dbGetEnvironment(id))
  handle('db:environments:create',    (env) => dbCreateEnvironment(env))
  handle('db:environments:update',    (id, data) => dbUpdateEnvironment(id, data))
  handle('db:environments:delete',    (id) => dbDeleteEnvironment(id))
  handle('db:environments:setActive', (id, workspaceId) => dbSetActiveEnvironment(id, workspaceId))

  handle('db:workspaceState:get',  (workspaceId) => dbGetWorkspaceState(workspaceId))
  handle('db:workspaceState:save', (workspaceId, state) => dbSaveWorkspaceState(workspaceId, state))

  handle('db:invites:forEmail',     (email) => dbGetInvitesForEmail(email))
  handle('db:invites:forWorkspace', (workspaceId) => dbGetInvitesForWorkspace(workspaceId))
  handle('db:invites:send',         (invite) => dbSendInvite(invite))
  handle('db:invites:delete',       (id) => dbDeleteInvite(id))

  const activeRequests = new Map<string, AbortController>()

  ipcMain.on('cancel-request', (_event, { requestId }: { requestId: string }) => {
    activeRequests.get(requestId)?.abort()
    activeRequests.delete(requestId)
  })

  ipcMain.handle('make-request', async (_event, options) => {
    try {
      const { url, method, headers, requestBody, formDataEntries, requestId } = options
      const controller = new AbortController()
      if (requestId) activeRequests.set(requestId, controller)

      if (!url) {
        return { error: 'URL is required' }
      }

      if (url.includes('{{') && url.includes('}}')) {
        return { error: `Unresolved environment variable in URL: ${url}. Please check if the environment is active and variables are enabled.` }
      }

      // Build headers object, filtering out certain headers
      const fetchHeaders: Record<string, string> = {}
      const skipHeaders = ['host', 'connection', 'content-length', 'transfer-encoding']

      if (headers) {
        for (const [key, value] of Object.entries(headers)) {
          if (!skipHeaders.includes(key.toLowerCase()) && typeof value === 'string') {
            fetchHeaders[key] = value
          }
        }
      }

      const startTime = Date.now()

      const fetchOptions: RequestInit = {
        method: method || 'GET',
        headers: fetchHeaders,
        signal: controller.signal,
      }

      // Add body for methods that support it
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        if (formDataEntries && formDataEntries.length > 0) {
          // Node's native fetch doesn't reliably serialize FormData in Electron,
          // so we manually build the multipart body.
          const boundary = `----FormBoundary${Math.random().toString(36).slice(2)}`
          const parts: Buffer[] = []
          for (const entry of formDataEntries) {
            if (entry.fileData) {
              const bytes = Buffer.from(entry.fileData.base64, 'base64')
              parts.push(Buffer.from(
                `--${boundary}\r\nContent-Disposition: form-data; name="${entry.key}"; filename="${entry.fileData.name}"\r\nContent-Type: ${entry.fileData.mimeType}\r\n\r\n`
              ))
              parts.push(bytes)
              parts.push(Buffer.from('\r\n'))
            } else {
              parts.push(Buffer.from(
                `--${boundary}\r\nContent-Disposition: form-data; name="${entry.key}"\r\n\r\n${entry.value}\r\n`
              ))
            }
          }
          parts.push(Buffer.from(`--${boundary}--\r\n`))
          const body = Buffer.concat(parts)
          fetchOptions.body = body as unknown as BodyInit
          fetchHeaders['Content-Type'] = `multipart/form-data; boundary=${boundary}`
          fetchHeaders['Content-Length'] = String(body.length)
        } else if (requestBody) {
          fetchOptions.body = requestBody
        }
      }

      // Ensure URL has a protocol
      let finalUrl = url
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        // If it looks like a hostname or IP, add http://
        if (url.includes('.') || url.includes('localhost') || url.includes('127.0.0.1')) {
          finalUrl = `http://${url}`
        }
      }

      const response = await fetch(finalUrl, fetchOptions)

      const endTime = Date.now()
      const responseTime = endTime - startTime

      // Get response body
      const contentType = response.headers.get('content-type') || 'text/plain'
      const isBinary = contentType.includes('image/') ||
        contentType.includes('application/pdf') ||
        contentType.includes('audio/') ||
        contentType.includes('video/') ||
        contentType.includes('application/octet-stream')

      let responseBody: string
      let size: number

      if (isBinary) {
        const buffer = await response.arrayBuffer()
        responseBody = Buffer.from(buffer).toString('base64')
        size = buffer.byteLength
      } else {
        responseBody = await response.text()

        // Prettify JSON if needed
        if (contentType.includes('application/json')) {
          try {
            const json = JSON.parse(responseBody)
            responseBody = JSON.stringify(json, null, 2)
          } catch (e) {
            // Keep original text if JSON parse fails
          }
        }

        size = new TextEncoder().encode(responseBody).length
      }

      // Convert headers to plain object
      const responseHeaders: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value
      })

      if (requestId) activeRequests.delete(requestId)
      return {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body: responseBody,
        size: size,
        time: responseTime,
        contentType: contentType,
        isBinary: isBinary,
        url: finalUrl,
      }
    } catch (error) {
      const isAbort = error instanceof Error && error.name === 'AbortError'
      if (options.requestId) activeRequests.delete(options.requestId)
      if (isAbort) return { aborted: true }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'

      return {
        status: 0,
        statusText: 'Network Error',
        headers: {},
        body: JSON.stringify({ error: errorMessage }, null, 2),
        size: 0,
        time: 0,
        contentType: 'application/json',
        isBinary: false,
      }
    }
  })

  // ── File picker for .ovpn files ─────────────────────────────────────────────
  ipcMain.handle('pg:select-ovpn-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Select OpenVPN Config',
      filters: [{ name: 'OpenVPN Config', extensions: ['ovpn'] }, { name: 'All Files', extensions: ['*'] }],
      properties: ['openFile'],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // ── Postgres connections ────────────────────────────────────────────────────
  const pgPools = new Map<string, Pool>()
  const vpnProcesses = new Map<string, ChildProcess>()

  function spawnVpn(id: string, configPath: string, username?: string, password?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Use a safe temp filename in the system temp dir (no spaces, no special chars)
      const safeId = id.replace(/[^a-zA-Z0-9]/g, '')
      const tmpDir = os.tmpdir()
      const tmpConfig = path.join(tmpDir, `ovpn-${safeId}.ovpn`)
      const original = fs.readFileSync(configPath, 'utf-8')
      fs.writeFileSync(tmpConfig, original)

      const args = ['--config', tmpConfig]

      // Write credentials to a temp file if provided, then pass via --auth-user-pass.
      // This avoids credentials appearing in process arguments.
      let tmpAuth: string | null = null
      if (username || password) {
        tmpAuth = path.join(tmpDir, `ovpn-auth-${safeId}.txt`)
        fs.writeFileSync(tmpAuth, `${username ?? ''}\n${password ?? ''}\n`, { mode: 0o600 })
        args.push('--auth-user-pass', tmpAuth)
      }

      // Resolve openvpn binary: try PATH first, fall back to the default Windows install location
      const openvpnBin = process.platform === 'win32'
        ? 'C:\\Program Files\\OpenVPN\\bin\\openvpn.exe'
        : 'openvpn'
      const proc = spawn(openvpnBin, args, { stdio: ['ignore', 'pipe', 'pipe'] })

      vpnProcesses.set(id, proc)

      let settled = false
      let outputLog = ''
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true
          reject(new Error(`OpenVPN timed out (30s).\n\nOutput:\n${outputLog || '(none)'}`))
        }
      }, 30000)

      const onData = (chunk: Buffer) => {
        const text = chunk.toString()
        outputLog += text
        console.log('[openvpn]', text.trimEnd())
        if (!settled) {
          if (text.includes('Initialization Sequence Completed')) {
            settled = true
            clearTimeout(timeout)
            console.log('[openvpn] connected. Full output:\n', outputLog)
            resolve()
          } else if (text.includes('AUTH_FAILED')) {
            settled = true
            clearTimeout(timeout)
            reject(new Error('OpenVPN authentication failed. Check your VPN username and password.'))
          } else if (text.includes('TLS handshake failed') || text.includes('TLS Error')) {
            settled = true
            clearTimeout(timeout)
            reject(new Error(`OpenVPN TLS error.\n\nOutput:\n${outputLog}`))
          } else if (text.includes('Connection refused') || text.includes('ECONNREFUSED')) {
            settled = true
            clearTimeout(timeout)
            reject(new Error(`OpenVPN server refused connection.\n\nOutput:\n${outputLog}`))
          }
        }
      }

      proc.stdout?.on('data', onData)
      proc.stderr?.on('data', onData)

      const cleanup = () => {
        try { fs.unlinkSync(tmpConfig) } catch {}
        if (tmpAuth) try { fs.unlinkSync(tmpAuth) } catch {}
      }

      proc.on('error', (err) => {
        if (!settled) {
          settled = true
          clearTimeout(timeout)
          cleanup()
          vpnProcesses.delete(id)
          reject(new Error(`Failed to start OpenVPN: ${err.message} (code: ${(err as any).code}). Make sure openvpn.exe is installed and in your PATH.`))
        }
      })

      proc.on('exit', (code) => {
        cleanup()
        vpnProcesses.delete(id)
        if (!settled) {
          settled = true
          clearTimeout(timeout)
          reject(new Error(`OpenVPN exited with code ${code}.\n\nOutput:\n${outputLog || '(none)'}`))
        }
      })
    })
  }

  function killVpn(id: string) {
    const proc = vpnProcesses.get(id)
    if (!proc) return
    try { proc.kill() } catch {}
    vpnProcesses.delete(id)
  }

  ipcMain.handle('pg:connect', async (_e, { id, host, port, database, user, password, ssl, vpnConfigPath, vpnUsername, vpnPassword }: {
    id: string; host: string; port: number; database: string; user: string; password: string; ssl: boolean; vpnConfigPath?: string; vpnUsername?: string; vpnPassword?: string
  }) => {
    try {
      if (pgPools.has(id)) {
        await pgPools.get(id)!.end()
        pgPools.delete(id)
      }
      killVpn(id)

      if (vpnConfigPath) {
        await spawnVpn(id, vpnConfigPath, vpnUsername, vpnPassword)
      }

      const pool = new Pool({ host, port, database, user, password, ssl: ssl ? { rejectUnauthorized: false } : false, connectionTimeoutMillis: 30000 })
      // Test the connection with an explicit timeout in case TCP opens but server never responds
      const client = await Promise.race([
        pool.connect(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Connection timed out after 30s')), 30000)),
      ])
      client.release()
      pgPools.set(id, pool)
      return { ok: true }
    } catch (err) {
      killVpn(id)
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('pg:disconnect', async (_e, { id }: { id: string }) => {
    try {
      await pgPools.get(id)?.end()
      pgPools.delete(id)
      killVpn(id)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // Per-database query pools: key = `${connId}::${database}`
  const dbQueryPools = new Map<string, Pool>()

  ipcMain.handle('pg:query', async (_e, { id, sql, database }: { id: string; sql: string; database?: string }) => {
    const basePool = pgPools.get(id)
    if (!basePool) return { ok: false, error: 'Not connected' }
    try {
      let pool = basePool
      if (database) {
        const key = `${id}::${database}`
        if (!dbQueryPools.has(key)) {
          const opts = (basePool as any).options as { host: string; port: number; user: string; password: string; ssl: any }
          const p = new Pool({ host: opts.host, port: opts.port, user: opts.user, password: opts.password, database, ssl: opts.ssl, connectionTimeoutMillis: 15000 })
          dbQueryPools.set(key, p)
        }
        pool = dbQueryPools.get(key)!
      }
      const start = Date.now()
      const result = await pool.query(sql)
      const ms = Date.now() - start
      return { ok: true, rows: result.rows, fields: result.fields.map(f => f.name), rowCount: result.rowCount, ms }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('pg:introspect', async (_e, { id }: { id: string }) => {
    const pool = pgPools.get(id)
    if (!pool) return { ok: false, error: 'Not connected' }
    try {
      const dbRes = await pool.query(
        `SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname`
      )
      return { ok: true, databases: dbRes.rows.map((r: { datname: string }) => r.datname) }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('pg:introspect-db', async (_e, { id, database }: { id: string; database: string }) => {
    const basePool = pgPools.get(id)
    if (!basePool) return { ok: false, error: 'Not connected' }
    // Get the connection config from the existing pool to open a new one against the target database
    const opts = (basePool as any).options as { host: string; port: number; user: string; password: string; ssl: any }
    const dbPool = new Pool({ host: opts.host, port: opts.port, user: opts.user, password: opts.password, database, ssl: opts.ssl, connectionTimeoutMillis: 15000 })
    try {
      const [tablesRes, funcsRes, enumsRes, typesRes] = await Promise.all([
        dbPool.query(`
          SELECT
            n.nspname AS table_schema,
            c.relname AS table_name,
            CASE
              WHEN c.relkind = 'r' THEN 'BASE TABLE'
              WHEN c.relkind = 'v' THEN 'VIEW'
              WHEN c.relkind = 'm' THEN 'MATERIALIZED VIEW'
              ELSE 'OTHER'
            END AS table_type
          FROM pg_class c
          JOIN pg_namespace n ON c.relnamespace = n.oid
          WHERE c.relkind IN ('r', 'v', 'm')
            AND n.nspname NOT IN ('pg_catalog', 'information_schema')
          ORDER BY table_schema, table_name
        `),
        dbPool.query(`
          SELECT
            n.nspname AS routine_schema,
            p.proname AS routine_name,
            pg_get_function_arguments(p.oid) AS arguments
          FROM pg_proc p
          JOIN pg_namespace n ON p.pronamespace = n.oid
          WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
          ORDER BY routine_schema, routine_name
        `),
        dbPool.query(`
          SELECT
            n.nspname AS schema,
            t.typname AS name,
            string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS values
          FROM pg_type t
          JOIN pg_namespace n ON t.typnamespace = n.oid
          JOIN pg_enum e ON e.enumtypid = t.oid
          WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
          GROUP BY n.nspname, t.typname
          ORDER BY schema, name
        `),
        dbPool.query(`
          SELECT
            n.nspname AS schema,
            t.typname AS name,
            CASE t.typtype
              WHEN 'c' THEN 'composite'
              WHEN 'd' THEN 'domain'
              WHEN 'r' THEN 'range'
              ELSE 'other'
            END AS definition
          FROM pg_type t
          JOIN pg_namespace n ON t.typnamespace = n.oid
          WHERE t.typtype IN ('c', 'd', 'r')
            AND n.nspname NOT IN ('pg_catalog', 'information_schema')
          ORDER BY schema, name
        `),
      ])
      return { ok: true, tables: tablesRes.rows, functions: funcsRes.rows, enums: enumsRes.rows, types: typesRes.rows }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    } finally {
      await dbPool.end()
    }
  })

  // ── MySQL connections ───────────────────────────────────────────────────────
  const mysqlPools = new Map<string, mysql.Pool>()

  ipcMain.handle('mysql:connect', async (_e, { id, host, port, database, user, password, ssl, vpnConfigPath, vpnUsername, vpnPassword }: {
    id: string; host: string; port: number; database: string; user: string; password: string; ssl: boolean; vpnConfigPath?: string; vpnUsername?: string; vpnPassword?: string
  }) => {
    try {
      if (mysqlPools.has(id)) {
        await mysqlPools.get(id)!.end()
        mysqlPools.delete(id)
      }
      killVpn(id)

      if (vpnConfigPath) {
        await spawnVpn(id, vpnConfigPath, vpnUsername, vpnPassword)
      }

      const pool = mysql.createPool({
        host, port, database: database || undefined, user, password,
        ssl: ssl ? { rejectUnauthorized: false } : undefined,
        connectTimeout: 10000,
        waitForConnections: true,
        connectionLimit: 5,
      })
      const conn = await Promise.race([
        pool.getConnection(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Connection timed out after 10s')), 10000)),
      ])
      conn.release()
      mysqlPools.set(id, pool)
      return { ok: true }
    } catch (err) {
      killVpn(id)
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('mysql:disconnect', async (_e, { id }: { id: string }) => {
    try {
      await mysqlPools.get(id)?.end()
      mysqlPools.delete(id)
      killVpn(id)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('mysql:query', async (_e, { id, sql, database }: { id: string; sql: string; database?: string }) => {
    const pool = mysqlPools.get(id)
    if (!pool) return { ok: false, error: 'Not connected' }
    try {
      const conn = await pool.getConnection()
      try {
        if (database) await conn.query(`USE \`${database}\``)
        const start = Date.now()
        const [rows, fields] = await conn.query({ sql, rowsAsArray: false }) as [any[], mysql.FieldPacket[]]
        const ms = Date.now() - start
        const fieldNames = Array.isArray(fields) ? fields.map((f: any) => f.name) : []
        const normalizedRows = Array.isArray(rows) ? rows : []
        return { ok: true, rows: normalizedRows, fields: fieldNames, rowCount: normalizedRows.length, ms }
      } finally {
        conn.release()
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('mysql:introspect', async (_e, { id }: { id: string }) => {
    const pool = mysqlPools.get(id)
    if (!pool) return { ok: false, error: 'Not connected' }
    try {
      const [rows] = await pool.query(`SHOW DATABASES`) as [any[], mysql.FieldPacket[]]
      const databases = rows.map((r: any) => Object.values(r)[0] as string)
        .filter(d => !['information_schema', 'performance_schema', 'mysql', 'sys'].includes(d))
      return { ok: true, databases }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('mysql:introspect-db', async (_e, { id, database }: { id: string; database: string }) => {
    const pool = mysqlPools.get(id)
    if (!pool) return { ok: false, error: 'Not connected' }
    try {
      const conn = await pool.getConnection()
      try {
        await conn.query(`USE \`${database}\``)
        const [[tablesRows], [funcsRows], [enumsRows]] = await Promise.all([
          conn.query(`
            SELECT TABLE_NAME AS table_name,
                   TABLE_TYPE AS table_type
            FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = ?
            ORDER BY TABLE_NAME
          `, [database]) as Promise<[any[], mysql.FieldPacket[]]>,
          conn.query(`
            SELECT ROUTINE_NAME AS routine_name,
                   ROUTINE_TYPE AS routine_type
            FROM information_schema.ROUTINES
            WHERE ROUTINE_SCHEMA = ?
            ORDER BY ROUTINE_NAME
          `, [database]) as Promise<[any[], mysql.FieldPacket[]]>,
          conn.query(`
            SELECT COLUMN_NAME AS name,
                   COLUMN_TYPE AS col_type,
                   TABLE_NAME  AS table_name
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = ?
              AND COLUMN_TYPE LIKE 'enum(%)'
            GROUP BY COLUMN_TYPE, COLUMN_NAME, TABLE_NAME
            ORDER BY TABLE_NAME, COLUMN_NAME
          `, [database]) as Promise<[any[], mysql.FieldPacket[]]>,
        ])

        // Tables and views — MySQL has no schemas, use database name as schema
        const tables = (tablesRows as any[]).map(r => ({
          table_schema: database,
          table_name: r.table_name,
          table_type: r.table_type === 'BASE TABLE' ? 'BASE TABLE' : r.table_type === 'VIEW' ? 'VIEW' : 'OTHER',
        }))

        // Functions and procedures
        const functions = (funcsRows as any[]).map(r => ({
          routine_schema: database,
          routine_name: r.routine_name,
          arguments: r.routine_type === 'PROCEDURE' ? '(procedure)' : '',
        }))

        // Enums — MySQL enums are per-column, group by type string
        const enumMap = new Map<string, string[]>()
        for (const r of enumsRows as any[]) {
          const match = /^enum\((.+)\)$/i.exec(r.col_type)
          if (!match) continue
          const values = match[1].split(',').map((v: string) => v.replace(/^'|'$/g, '').trim())
          const key = `${r.table_name}.${r.name}`
          enumMap.set(key, values)
        }
        const enums = [...enumMap.entries()].map(([name, values]) => ({ schema: database, name, values }))

        return { ok: true, tables, functions, enums, types: [] }
      } finally {
        conn.release()
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ── Terminal ────────────────────────────────────────────────────────────────
  const termProcesses = new Map<string, pty.IPty>()
  const termAlive = new Map<string, boolean>()
  const termResizeReady = new Map<string, boolean>()
  // Popout windows: id → BrowserWindow
  const termPopouts = new Map<string, BrowserWindow>()

  function destroyTerm(id: string) {
    if (!termAlive.get(id)) return
    termAlive.set(id, false)
    termResizeReady.delete(id)
    const proc = termProcesses.get(id)
    if (proc) {
      // Suppress the "AttachConsole failed" stderr noise from node-pty's
      // conpty_console_list_agent on Windows during process teardown
      const origWrite = process.stderr.write.bind(process.stderr) as typeof process.stderr.write
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(process.stderr as any).write = (chunk: string | Uint8Array, ...rest: any[]) => {
        const s = typeof chunk === 'string' ? chunk : chunk.toString()
        if (s.includes('AttachConsole') || s.includes('conpty_console_list')) return true
        return origWrite(chunk, ...rest)
      }
      try { proc.kill() } catch {}
      termProcesses.delete(id)
      setTimeout(() => { process.stderr.write = origWrite }, 500)
    }
  }

  function sendToTerm(id: string, data: string) {
    const popout = termPopouts.get(id)
    if (popout && !popout.isDestroyed()) {
      popout.webContents.send(`pty:data:${id}`, data)
      return
    }
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send(`pty:data:${id}`, data)
  }

  ipcMain.handle('pty:create', (_e, { id, cols, rows, cwd }: { id: string; cols: number; rows: number; cwd?: string }) => {
    // If PTY already exists and is alive, just re-attach (renderer remounted)
    if (termAlive.get(id) && termProcesses.has(id)) {
      return { ok: true, reattached: true }
    }

    // Clean up any dead entry before spawning fresh
    destroyTerm(id)

    const isWin = process.platform === 'win32'
    const shell = isWin
      ? (process.env.COMSPEC || 'cmd.exe')
      : (process.env.SHELL ?? 'bash')
    const args = isWin ? ['/K'] : []
    const env = { ...process.env } as Record<string, string>
    delete env['TERM']

    let proc: pty.IPty
    try {
      proc = pty.spawn(shell, args, {
        name: 'xterm-256color',
        cols: Math.max(cols || 80, 1),
        rows: Math.max(rows || 24, 1),
        cwd: cwd || os.homedir(),
        env,
        useConpty: true,
      })
    } catch (e: any) {
      sendToTerm(id, `\r\n\x1b[31m[failed to start terminal: ${e.message}]\x1b[0m\r\n`)
      return { ok: false, error: e.message }
    }

    termProcesses.set(id, proc)
    termAlive.set(id, true)

    // Block resizes for 1s — ConPTY crashes if resized during initialisation
    setTimeout(() => { if (termAlive.get(id)) termResizeReady.set(id, true) }, 1000)

    proc.onData(data => {
      if (!termAlive.get(id)) return
      sendToTerm(id, data)
    })

    proc.onExit(() => {
      sendToTerm(id, `\r\n\x1b[90m[process exited]\x1b[0m\r\n`)
      const popout = termPopouts.get(id)
      if (popout && !popout.isDestroyed()) popout.webContents.send(`pty:exit:${id}`)
      else if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(`pty:exit:${id}`)
      termAlive.delete(id)
      termResizeReady.delete(id)
      termProcesses.delete(id)
    })

    return { ok: true }
  })

  ipcMain.on('pty:write', (_e, { id, data }: { id: string; data: string }) => {
    if (!termAlive.get(id)) return
    try { termProcesses.get(id)?.write(data) } catch {}
  })

  ipcMain.on('pty:resize', (_e, { id, cols, rows }: { id: string; cols: number; rows: number }) => {
    if (!termAlive.get(id) || !termResizeReady.get(id)) return
    try { termProcesses.get(id)?.resize(Math.max(cols, 1), Math.max(rows, 1)) } catch {}
  })

  ipcMain.on('pty:ready', () => {})

  ipcMain.handle('pty:kill', (_e, { id }: { id: string }) => {
    destroyTerm(id)
    return { ok: true }
  })

  ipcMain.on('pty:popin', (_e, { id }: { id: string }) => {
    // Tell the main window to reclaim this terminal, then close the popout
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pty:popin', id)
      mainWindow.focus()
    }
    const popout = termPopouts.get(id)
    if (popout && !popout.isDestroyed()) popout.close()
  })

  ipcMain.handle('pty:popout', async (_e, { id, title }: { id: string; title: string }) => {
    // If already popped out, just focus it
    const existing = termPopouts.get(id)
    if (existing && !existing.isDestroyed()) { existing.focus(); return { ok: true } }

    const win = new BrowserWindow({
      width: 800,
      height: 500,
      minWidth: 400,
      minHeight: 200,
      title,
      frame: false,
      show: false,
      icon: path.join(__dirname, '..', 'public', process.platform === 'win32' ? 'logo.ico' : 'logo.png'),
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
      },
    })

    termPopouts.set(id, win)
    win.on('closed', () => {
      termPopouts.delete(id)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('pty:popout-closed', id)
      }
    })

    if (isProd) {
      await win.loadURL(`app://-/terminal?id=${encodeURIComponent(id)}&title=${encodeURIComponent(title)}`)
    } else {
      const port = process.argv[2] || 3000
      await win.loadURL(`http://localhost:${port}/terminal?id=${encodeURIComponent(id)}&title=${encodeURIComponent(title)}`)
    }

    win.show()
    return { ok: true }
  })

  ipcMain.handle('pty:homedir', () => os.homedir())

  ipcMain.handle('pty:stats', async (_e, { ids }: { ids: string[] }) => {
    const pids = ids.map(id => termProcesses.get(id)?.pid).filter((p): p is number => p != null)
    if (pids.length === 0) return {}
    try {
      const stats = await pidusage(pids)
      const result: Record<string, { cpu: number; memory: number }> = {}
      for (const id of ids) {
        const pid = termProcesses.get(id)?.pid
        if (pid != null && stats[pid]) {
          result[id] = { cpu: stats[pid].cpu, memory: stats[pid].memory }
        }
      }
      return result
    } catch {
      return {}
    }
  })

  // Kill all PTYs before Node starts tearing down its environment.
  // If onData fires after teardown, node-pty throws a C++ exception → SIGABRT.
  // 'before-quit' fires before 'will-quit' and before window close, giving us
  // a chance to destroy PTYs while the JS environment is still intact.
  app.on('before-quit', () => {
    for (const id of [...termProcesses.keys()]) {
      destroyTerm(id)
    }
    termProcesses.clear()
    termAlive.clear()
    termResizeReady.clear()
  })

  app.on('will-quit', () => {
    for (const [id] of vpnProcesses) {
      killVpn(id)
    }
  })
})

app.on('window-all-closed', () => {
  // On non-mac, only quit if there are no popout terminal windows still open
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Auto-updater — only runs in production builds
if (isProd) {
  const logFile = fs.createWriteStream(path.join(app.getPath('userData'), 'updater.log'), { flags: 'a' })
  const log = {
    info:  (...a: unknown[]) => { const msg = `[${new Date().toISOString()}] INFO  ${a.join(' ')}\n`; logFile.write(msg); console.log(msg.trimEnd()) },
    warn:  (...a: unknown[]) => { const msg = `[${new Date().toISOString()}] WARN  ${a.join(' ')}\n`; logFile.write(msg); console.warn(msg.trimEnd()) },
    error: (...a: unknown[]) => { const msg = `[${new Date().toISOString()}] ERROR ${a.join(' ')}\n`; logFile.write(msg); console.error(msg.trimEnd()) },
  }
  autoUpdater.logger = log
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  // macOS: use zip for updates (works without code signing / notarisation)
  if (process.platform === 'darwin') {
    autoUpdater.channel = 'latest'
  }

  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'Marijanoo',
    repo: 'quence',
  })

  autoUpdater.on('checking-for-update', () => {
    log.info('[updater] Checking for update…')
  })

  autoUpdater.on('update-available', (info) => {
    log.info('[updater] Update available:', info.version)
    mainWindow?.webContents.send('update-available')
  })

  autoUpdater.on('update-not-available', (info) => {
    log.info('[updater] Already up to date:', info.version)
  })

  autoUpdater.on('download-progress', (info) => {
    log.info(`[updater] Downloading… ${info.percent.toFixed(1)}% (${(info.transferred / 1024 / 1024).toFixed(1)} / ${(info.total / 1024 / 1024).toFixed(1)} MB)`)
    mainWindow?.webContents.send('update-progress', info.percent)
  })

  autoUpdater.on('update-downloaded', (info) => {
    log.info('[updater] Update downloaded, ready to install:', info.version)
    mainWindow?.webContents.send('update-downloaded')
  })

  autoUpdater.on('error', (err) => {
    log.error('[updater] Error:', err?.message ?? err)
  })

  // Swallow unhandled rejections from electron-updater (e.g. 404 before release is published)
  process.on('unhandledRejection', () => {})

  ipcMain.on('install-update', () => {
    log.info('[updater] install-update requested, calling quitAndInstall')
    // isSilent=true, isForceRunAfter=false — let the user reopen manually.
    // forceRunAfter=true is unreliable on macOS without notarisation (open -a gets blocked).
    autoUpdater.quitAndInstall(true, false)
  })

  // Check once the first window finishes loading, then every 4 hours
  app.on('browser-window-created', (_, win) => {
    win.webContents.once('did-finish-load', () => {
      setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 3000)
      setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000)
    })
  })
}

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})
