import { app, BrowserWindow, ipcMain } from 'electron'
import * as path from 'path'
import serve from 'electron-serve'

const isProd = process.env.NODE_ENV === 'production'

if (isProd) {
  serve({ directory: 'out' })
} else {
  app.setPath('userData', `${app.getPath('userData')} (development)`)
}

let mainWindow: BrowserWindow | null = null

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

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
    mainWindow.webContents.openDevTools()
  }

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && (input.key === '=' || input.key === '+')) {
      const currentZoom = mainWindow!.webContents.getZoomLevel()
      mainWindow!.webContents.setZoomLevel(currentZoom + 0.5)
      event.preventDefault()
    } else if (input.control && input.key === '-') {
      const currentZoom = mainWindow!.webContents.getZoomLevel()
      mainWindow!.webContents.setZoomLevel(currentZoom - 0.5)
      event.preventDefault()
    } else if (input.control && input.key === '0') {
      mainWindow!.webContents.setZoomLevel(0)
      event.preventDefault()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.on('ready', () => {
  createWindow()

  ipcMain.on('window-minimize', () => mainWindow?.minimize())
  ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })
  ipcMain.on('window-close', () => mainWindow?.close())

  ipcMain.handle('make-request', async (_event, options) => {
    try {
      const { url, method, headers, requestBody } = options

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
      }

      // Add body for methods that support it
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && requestBody) {
        fetchOptions.body = requestBody
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
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})
