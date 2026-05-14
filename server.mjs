import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import { WebSocketServer, WebSocket } from 'ws'
import { io as ioClient } from 'socket.io-client'

const port = parseInt(process.env.PORT || '3000', 10)
const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

await app.prepare()

const server = createServer((req, res) => {
  handle(req, res, parse(req.url, true))
})

// Next.js internal upgrade handler (HMR, etc.)
const nextUpgradeHandler = app.getUpgradeHandler()

// Map of clientId → { clientWs, cleanup() }
const connections = new Map()

const wss = new WebSocketServer({ noServer: true })

function normaliseSocketIoUrl(url) {
  // socket.io-client wants http(s):// — the client already converts the scheme,
  // but handle ws(s):// defensively just in case.
  let u = url
  if (u.startsWith('wss://')) u = 'https://' + u.slice(6)
  else if (u.startsWith('ws://')) u = 'http://' + u.slice(5)
  // Strip any /socket.io path that slipped through
  const sioIdx = u.indexOf('/socket.io')
  if (sioIdx !== -1) u = u.slice(0, sioIdx)
  return u
}

function bridgeSocketIo(clientWs, targetUrl, extraHeaders) {
  const baseUrl = normaliseSocketIoUrl(targetUrl)

  const socket = ioClient(baseUrl, {
    // Start with polling so nginx can do the EIO handshake and issue a session ID,
    // then upgrade to WebSocket. Skipping polling with websocket-only causes 502s
    // on servers behind nginx reverse proxies that require the full handshake.
    transports: ['polling', 'websocket'],
    extraHeaders,
    reconnection: false,
    // Don't set a client-side timeout — let the server's pingInterval/pingTimeout
    // control liveness. A short timeout races with the server's heartbeat cycle
    // (default: 25s interval + 20s timeout) and causes spurious disconnects.
    ackTimeout: 30000,
  })

  socket.on('connect', () => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type: '__open' }))
    }
  })

  // Relay every event received from the server back to the browser client
  // using socket.io-client's catch-all listener
  socket.onAny((event, ...args) => {
    if (clientWs.readyState !== WebSocket.OPEN) return
    clientWs.send(JSON.stringify({
      type: '__message',
      // Re-encode as Socket.IO wire format so the existing browser parser works
      data: JSON.stringify([event, ...(Array.isArray(args) ? args : [args])]),
      isBinary: false,
    }))
  })

  socket.on('disconnect', (reason) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type: '__close', code: 1000, reason }))
      clientWs.close()
    }
  })

  socket.on('connect_error', (err) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type: '__error', message: err.message }))
      clientWs.close()
    }
    socket.disconnect()
  })

  // Messages from the browser client → emit to Socket.IO server
  clientWs.on('message', (raw) => {
    const text = raw.toString()
    try {
      const parsed = JSON.parse(text)
      // ACK request: emit with a callback and relay the response back
      if (parsed?.__ack === true) {
        console.log(`[ws-proxy] ACK emit event=${parsed.event} data=${JSON.stringify(parsed.data)}`)
        socket.emit(parsed.event, parsed.data, (...ackArgs) => {
          console.log(`[ws-proxy] ACK callback fired ackArgs=`, ackArgs)
          if (clientWs.readyState !== WebSocket.OPEN) return
          const ackData = ackArgs.length === 1 ? ackArgs[0] : ackArgs
          const payload = typeof ackData === 'string' ? ackData : JSON.stringify(ackData)
          clientWs.send(JSON.stringify({ type: '__message', data: JSON.stringify(['__ack__', payload]), isBinary: false }))
        })
        return
      }
      if (Array.isArray(parsed) && typeof parsed[0] === 'string') {
        const [event, ...args] = parsed
        socket.emit(event, ...args)
        return
      }
    } catch { /* not JSON array — fall through */ }
    // Plain text: emit as a 'message' event
    socket.emit('message', text)
  })

  clientWs.on('close', () => socket.disconnect())

  return () => socket.disconnect()
}

function bridgeRawWebSocket(clientWs, targetUrl, extraHeaders, reqHeaders) {
  const targetWs = new WebSocket(targetUrl, {
    headers: {
      ...extraHeaders,
      'User-Agent': reqHeaders['user-agent'],
      'Origin': reqHeaders['origin'],
    },
    perMessageDeflate: false,
  })

  targetWs.on('open', () => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type: '__open' }))
    }
  })

  targetWs.on('message', (data, isBinary) => {
    if (clientWs.readyState !== WebSocket.OPEN) return
    if (isBinary) {
      clientWs.send(JSON.stringify({ type: '__message', data: Buffer.from(data).toString('base64'), isBinary: true }))
    } else {
      clientWs.send(JSON.stringify({ type: '__message', data: data.toString(), isBinary: false }))
    }
  })

  targetWs.on('close', (code, reason) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type: '__close', code, reason: reason.toString() }))
      clientWs.close()
    }
  })

  targetWs.on('error', (err) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type: '__error', message: err.message }))
      clientWs.close()
    }
  })

  clientWs.on('message', (data) => {
    if (targetWs.readyState === WebSocket.OPEN) targetWs.send(data.toString())
  })

  clientWs.on('close', () => targetWs.close())

  return () => targetWs.close()
}

server.on('upgrade', (req, socket, head) => {
  const { pathname, query } = parse(req.url, true)

  if (pathname !== '/ws-proxy') {
    nextUpgradeHandler(req, socket, head)
    return
  }

  wss.handleUpgrade(req, socket, head, (clientWs) => {
    const targetUrl = query.url
    if (!targetUrl) {
      clientWs.close(1008, 'Missing url parameter')
      return
    }

    let extraHeaders = {}
    try {
      if (query.headers) extraHeaders = JSON.parse(query.headers)
    } catch { /* ignore */ }

    const id = Math.random().toString(36).slice(2)
    let cleanup

    console.log(`[ws-proxy] protocol=${query.protocol} url=${targetUrl}`)

    if (query.protocol === 'socketio') {
      cleanup = bridgeSocketIo(clientWs, targetUrl, extraHeaders)
    } else {
      cleanup = bridgeRawWebSocket(clientWs, targetUrl, extraHeaders, req.headers)
    }

    connections.set(id, { clientWs, cleanup })
    clientWs.on('close', () => { cleanup(); connections.delete(id) })
  })
})

server.listen(port, () => {
  console.log(`> Ready on http://localhost:${port}`)
})
