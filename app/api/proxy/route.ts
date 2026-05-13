import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { url, method, headers, requestBody } = body

    if (!url) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      )
    }

    if (url.includes('{{') && url.includes('}}')) {
      return NextResponse.json(
        { error: `Unresolved environment variable in URL: ${url}. Please check if the environment is active and variables are enabled.` },
        { status: 400 }
      )
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

    return NextResponse.json({
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: responseBody,
      size: size,
      time: responseTime,
      contentType: contentType,
      isBinary: isBinary,
      url: finalUrl,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    
    return NextResponse.json({
      status: 0,
      statusText: 'Network Error',
      headers: {},
      body: JSON.stringify({ error: errorMessage }, null, 2),
      size: 0,
      time: 0,
      contentType: 'application/json',
      isBinary: false,
    })
  }
}
