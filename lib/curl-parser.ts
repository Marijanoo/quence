import type { RequestConfig, HttpMethod, KeyValuePair, BodyType, AuthConfig } from '@/lib/db/types'
import { generateId } from '@/lib/utils'

function uuid() {
  return generateId()
}

// Split a curl command into tokens, respecting quoted strings and backslash line continuations.
function tokenize(input: string): string[] {
  // Normalize line continuations: \ followed by optional spaces then \r\n or \n or \r
  const normalized = input.replace(/\\\s*\r?\n\s*/g, ' ').trim()

  const tokens: string[] = []
  let i = 0

  while (i < normalized.length) {
    // Skip whitespace
    while (i < normalized.length && /\s/.test(normalized[i])) i++
    if (i >= normalized.length) break

    const ch = normalized[i]

    if (ch === '"' || ch === "'") {
      // Quoted string
      const quote = ch
      i++
      let str = ''
      while (i < normalized.length && normalized[i] !== quote) {
        if (normalized[i] === '\\' && quote === '"') {
          i++
          str += normalized[i] ?? ''
        } else {
          str += normalized[i]
        }
        i++
      }
      i++ // closing quote
      tokens.push(str)
    } else {
      // Unquoted token
      let str = ''
      while (i < normalized.length && !/\s/.test(normalized[i])) {
        str += normalized[i]
        i++
      }
      tokens.push(str)
    }
  }

  return tokens
}

export function isCurlCommand(text: string): boolean {
  return /^\s*curl\s/i.test(text)
}

export function parseCurl(input: string): Partial<RequestConfig> | null {
  const tokens = tokenize(input)
  if (tokens.length === 0 || tokens[0].toLowerCase() !== 'curl') return null

  let url = ''
  let method: HttpMethod | null = null
  const headers: KeyValuePair[] = []
  let bodyContent = ''
  let bodyType: BodyType = 'none'
  let auth: AuthConfig = { type: 'none' }
  let isGetForced = false

  let i = 1
  while (i < tokens.length) {
    const tok = tokens[i]

    // Skip bare backslash continuation artifacts
    if (tok === '\\') { i++; continue }

    // -X / --request METHOD
    if (tok === '-X' || tok === '--request') {
      method = (tokens[++i]?.toUpperCase() ?? 'GET') as HttpMethod
      i++
      continue
    }

    // -H / --header "Key: Value"
    if (tok === '-H' || tok === '--header') {
      const raw = tokens[++i] ?? ''
      const colon = raw.indexOf(':')
      if (colon !== -1) {
        headers.push({
          id: uuid(),
          key: raw.slice(0, colon).trim(),
          value: raw.slice(colon + 1).trim(),
          enabled: true,
        })
      }
      i++
      continue
    }

    // -d / --data / --data-raw / --data-binary / --data-ascii / --data-urlencode
    if (
      tok === '-d' || tok === '--data' || tok === '--data-raw' ||
      tok === '--data-binary' || tok === '--data-ascii' || tok === '--data-urlencode'
    ) {
      let data = tokens[++i] ?? ''
      // --data-binary may prefix with @filename — skip that case, just use the value
      if (data.startsWith('@')) data = ''
      bodyContent = bodyContent ? bodyContent + '&' + data : data
      i++
      continue
    }

    // --json (curl 7.82+)
    if (tok === '--json') {
      bodyContent = tokens[++i] ?? ''
      bodyType = 'json'
      i++
      continue
    }

    // -u / --user user:password  →  Basic auth
    if (tok === '-u' || tok === '--user') {
      const creds = tokens[++i] ?? ''
      const colon = creds.indexOf(':')
      auth = {
        type: 'basic',
        basic: {
          username: colon === -1 ? creds : creds.slice(0, colon),
          password: colon === -1 ? '' : creds.slice(colon + 1),
        },
      }
      i++
      continue
    }

    // -A / --user-agent value  →  header
    if (tok === '-A' || tok === '--user-agent') {
      headers.push({ id: uuid(), key: 'User-Agent', value: tokens[++i] ?? '', enabled: true })
      i++
      continue
    }

    // -b / --cookie value  →  header
    if (tok === '-b' || tok === '--cookie') {
      headers.push({ id: uuid(), key: 'Cookie', value: tokens[++i] ?? '', enabled: true })
      i++
      continue
    }

    // --url URL  (explicit url flag)
    if (tok === '--url') {
      url = tokens[++i] ?? ''
      i++
      continue
    }

    // -G / --get  →  force GET even if -d present
    if (tok === '-G' || tok === '--get') {
      isGetForced = true
      i++
      continue
    }

    // Flags with no value that we can safely skip
    if (
      tok === '-s' || tok === '--silent' ||
      tok === '-S' || tok === '--show-error' ||
      tok === '-v' || tok === '--verbose' ||
      tok === '-i' || tok === '--include' ||
      tok === '-I' || tok === '--head' ||
      tok === '-L' || tok === '--location' ||
      tok === '-k' || tok === '--insecure' ||
      tok === '-g' || tok === '--globoff' ||
      tok === '--compressed' || tok === '--no-keepalive' ||
      tok === '-f' || tok === '--fail'
    ) {
      // -I implies HEAD
      if (tok === '-I' || tok === '--head') method = 'HEAD'
      i++
      continue
    }

    // Flags with a value we don't use — skip both tokens
    if (
      tok === '-o' || tok === '--output' ||
      tok === '-e' || tok === '--referer' ||
      tok === '-m' || tok === '--max-time' ||
      tok === '--connect-timeout' ||
      tok === '--limit-rate' ||
      tok === '--proxy' || tok === '-x' ||
      tok === '--cacert' || tok === '--cert' || tok === '--key' ||
      tok === '--resolve' || tok === '--dns-servers' ||
      tok === '-w' || tok === '--write-out'
    ) {
      i += 2
      continue
    }

    // Bearer token header shorthand — detect Authorization: Bearer from parsed headers later
    // Unknown flag starting with - → skip (with value if next token doesn't start with -)
    if (tok.startsWith('-')) {
      i++
      if (i < tokens.length && !tokens[i].startsWith('-')) i++
      continue
    }

    // Bare URL (not a flag)
    if (!url) {
      url = tok
    }
    i++
  }

  if (!url) return null

  // Infer body type from Content-Type header if not already set by --json
  if (bodyContent && bodyType === 'none') {
    const ct = headers.find(h => h.key.toLowerCase() === 'content-type')?.value?.toLowerCase() ?? ''
    if (ct.includes('application/json')) {
      bodyType = 'json'
    } else if (ct.includes('application/x-www-form-urlencoded')) {
      bodyType = 'x-www-form-urlencoded'
    } else if (ct.includes('multipart/form-data')) {
      bodyType = 'form-data'
    } else {
      // Try to detect JSON by content shape
      const trimmed = bodyContent.trim()
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        bodyType = 'json'
        // Prettify if valid JSON
        try {
          bodyContent = JSON.stringify(JSON.parse(trimmed), null, 2)
        } catch { /* keep as-is */ }
      } else {
        bodyType = 'raw'
      }
    }
  }

  // Prettify JSON body if type is json and content is valid JSON
  if (bodyType === 'json') {
    try {
      bodyContent = JSON.stringify(JSON.parse(bodyContent), null, 2)
    } catch { /* keep as-is */ }
  }

  // Parse form data into key-value pairs for x-www-form-urlencoded
  const formData: KeyValuePair[] = []
  if (bodyType === 'x-www-form-urlencoded' && bodyContent) {
    for (const part of bodyContent.split('&')) {
      const eq = part.indexOf('=')
      formData.push({
        id: uuid(),
        key: eq === -1 ? decodeURIComponent(part) : decodeURIComponent(part.slice(0, eq)),
        value: eq === -1 ? '' : decodeURIComponent(part.slice(eq + 1)),
        enabled: true,
      })
    }
  }

  // Extract Authorization header into auth config if not already set
  if (auth.type === 'none') {
    const authHeader = headers.find(h => h.key.toLowerCase() === 'authorization')
    if (authHeader) {
      const val = authHeader.value
      if (val.toLowerCase().startsWith('bearer ')) {
        auth = { type: 'bearer', bearer: { token: val.slice(7).trim() } }
        headers.splice(headers.indexOf(authHeader), 1)
      } else if (val.toLowerCase().startsWith('basic ')) {
        try {
          const decoded = atob(val.slice(6).trim())
          const colon = decoded.indexOf(':')
          auth = {
            type: 'basic',
            basic: {
              username: colon === -1 ? decoded : decoded.slice(0, colon),
              password: colon === -1 ? '' : decoded.slice(colon + 1),
            },
          }
          headers.splice(headers.indexOf(authHeader), 1)
        } catch { /* keep as header */ }
      }
    }
  }

  // Extract query params from URL
  const params: KeyValuePair[] = []
  let cleanUrl = url
  try {
    // handle URLs without protocol
    const fullUrl = url.startsWith('http') ? url : 'http://' + url
    const parsed = new URL(fullUrl)
    parsed.searchParams.forEach((value, key) => {
      params.push({ id: uuid(), key, value, enabled: true })
    })
    // Rebuild URL without query string (params go into the params tab)
    parsed.search = ''
    cleanUrl = url.startsWith('http') ? parsed.toString() : parsed.toString().replace('http://', '')
  } catch { /* keep original URL */ }

  // Determine method
  let finalMethod: HttpMethod
  if (isGetForced) {
    finalMethod = 'GET'
  } else if (method) {
    finalMethod = method
  } else if (bodyContent) {
    finalMethod = 'POST'
  } else {
    finalMethod = 'GET'
  }

  return {
    method: finalMethod,
    url: cleanUrl,
    params,
    headers,
    body: {
      type: bodyType,
      content: bodyType === 'x-www-form-urlencoded' ? '' : bodyContent,
      formData: bodyType === 'x-www-form-urlencoded' ? formData : [],
    },
    auth,
  }
}

function shellEscape(s: string): string {
  // Use single-quotes; escape any single-quotes inside by ending the quote, adding \', and restarting
  return `'${s.replace(/'/g, "'\\''")}'`
}

export function buildCurl(request: RequestConfig): string {
  const parts: string[] = ['curl']

  // Method (omit -X GET since it's the default)
  if (request.method !== 'GET') {
    parts.push(`-X ${request.method}`)
  }

  // URL with query params
  let url = request.url
  const enabledParams = (request.params ?? []).filter(p => p.enabled && p.key)
  if (enabledParams.length > 0) {
    const qs = enabledParams.map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&')
    url += (url.includes('?') ? '&' : '?') + qs
  }
  parts.push(shellEscape(url))

  // Auth → Authorization header
  if (request.auth?.type === 'bearer' && request.auth.bearer?.token) {
    parts.push(`-H ${shellEscape(`Authorization: Bearer ${request.auth.bearer.token}`)}`)
  } else if (request.auth?.type === 'basic' && request.auth.basic) {
    const { username, password } = request.auth.basic
    parts.push(`-u ${shellEscape(`${username}:${password}`)}`)
  } else if (request.auth?.type === 'api-key' && request.auth.apiKey) {
    if (request.auth.apiKey.addTo === 'header') {
      parts.push(`-H ${shellEscape(`${request.auth.apiKey.key}: ${request.auth.apiKey.value}`)}`)
    }
  }

  // Headers
  for (const h of (request.headers ?? []).filter(h => h.enabled && h.key)) {
    parts.push(`-H ${shellEscape(`${h.key}: ${h.value}`)}`)
  }

  // Body
  const body = request.body
  if (body) {
    if (body.type === 'json' && body.content) {
      // Compact JSON for the curl command
      let bodyStr = body.content
      try { bodyStr = JSON.stringify(JSON.parse(body.content)) } catch { /* keep as-is */ }
      parts.push(`-H ${shellEscape('Content-Type: application/json')}`)
      parts.push(`-d ${shellEscape(bodyStr)}`)
    } else if (body.type === 'raw' && body.content) {
      parts.push(`-d ${shellEscape(body.content)}`)
    } else if (body.type === 'x-www-form-urlencoded' && body.formData?.length) {
      const encoded = body.formData
        .filter(f => f.enabled && f.key)
        .map(f => `${encodeURIComponent(f.key)}=${encodeURIComponent(f.value)}`)
        .join('&')
      parts.push(`-H ${shellEscape('Content-Type: application/x-www-form-urlencoded')}`)
      parts.push(`-d ${shellEscape(encoded)}`)
    } else if (body.type === 'form-data' && body.formData?.length) {
      for (const f of body.formData.filter(f => f.enabled && f.key)) {
        parts.push(`-F ${shellEscape(`${f.key}=${f.value}`)}`)
      }
    }
  }

  return parts.join(' \\\n  ')
}
