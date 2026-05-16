'use client'

import { useState, useCallback } from 'react'
import { Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Shared helpers ────────────────────────────────────────────────────────────

function base64UrlEncode(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(str: string): string {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(str.length + (4 - str.length % 4) % 4, '=')
  try {
    return decodeURIComponent(
      atob(padded).split('').map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
    )
  } catch {
    return atob(padded)
  }
}

function parseJwt(token: string): { header: object; payload: object; signature: string } | null {
  const parts = token.trim().split('.')
  if (parts.length !== 3) return null
  try {
    return {
      header: JSON.parse(base64UrlDecode(parts[0])),
      payload: JSON.parse(base64UrlDecode(parts[1])),
      signature: parts[2],
    }
  } catch {
    return null
  }
}

function isExpired(payload: Record<string, unknown>): boolean | null {
  if (typeof payload.exp !== 'number') return null
  return payload.exp * 1000 < Date.now()
}

function formatTimestamp(value: unknown): string | null {
  if (typeof value !== 'number') return null
  const date = new Date(value * 1000)
  if (isNaN(date.getTime())) return null
  return date.toLocaleString()
}

const TIME_FIELDS = new Set(['exp', 'iat', 'nbf'])

function JsonValue({ value, fieldKey }: { value: unknown; fieldKey?: string }) {
  if (value === null) return <span className="text-muted-foreground">null</span>
  if (typeof value === 'boolean') return <span className="text-primary">{String(value)}</span>
  if (typeof value === 'number') {
    const ts = fieldKey && TIME_FIELDS.has(fieldKey) ? formatTimestamp(value) : null
    return (
      <span>
        <span className="text-[oklch(0.75_0.15_55)]">{value}</span>
        {ts && <span className="text-muted-foreground ml-2 text-[11px]">({ts})</span>}
      </span>
    )
  }
  if (typeof value === 'string') return <span className="text-[oklch(0.75_0.15_160)]">&quot;{value}&quot;</span>
  if (Array.isArray(value)) {
    return (
      <span>
        {'['}
        {value.map((v, i) => (
          <span key={i}>{i > 0 && ', '}<JsonValue value={v} /></span>
        ))}
        {']'}
      </span>
    )
  }
  if (typeof value === 'object') {
    return <span className="text-muted-foreground">{JSON.stringify(value)}</span>
  }
  return <span>{String(value)}</span>
}

function JsonBlock({ data }: { data: object }) {
  const entries = Object.entries(data)
  return (
    <div className="font-mono text-xs space-y-1">
      <span className="text-muted-foreground">{'{'}</span>
      {entries.map(([k, v], i) => (
        <div key={k} className="pl-4">
          <span className="text-[oklch(0.7_0.12_280)]">&quot;{k}&quot;</span>
          <span className="text-muted-foreground">: </span>
          <JsonValue value={v} fieldKey={k} />
          {i < entries.length - 1 && <span className="text-muted-foreground">,</span>}
        </div>
      ))}
      <span className="text-muted-foreground">{'}'}</span>
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [text])
  return (
    <button onClick={copy} className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded">
      {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

function Section({
  label,
  color,
  copyText,
  children,
}: {
  label: string
  color: string
  copyText?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 min-h-0">
      <div className="flex items-center justify-between shrink-0">
        <span className={cn('text-[11px] font-semibold uppercase tracking-widest', color)}>{label}</span>
        {copyText && <CopyButton text={copyText} />}
      </div>
      <div className="flex-1 overflow-y-auto bg-background rounded-md border border-border p-3 text-xs break-all leading-relaxed">
        {children}
      </div>
    </div>
  )
}

// ── Encoder ───────────────────────────────────────────────────────────────────

const DEFAULT_HEADER = JSON.stringify({ alg: 'HS256', typ: 'JWT' }, null, 2)
const DEFAULT_PAYLOAD = JSON.stringify(
  { sub: '1234567890', name: 'John Doe', iat: Math.floor(Date.now() / 1000) },
  null,
  2
)

async function buildToken(headerJson: string, payloadJson: string, secret: string, alg: string): Promise<string> {
  const headerB64 = base64UrlEncode(headerJson)
  const payloadB64 = base64UrlEncode(payloadJson)
  const signingInput = `${headerB64}.${payloadB64}`

  if (alg === 'none' || !secret.trim()) {
    return `${signingInput}.`
  }

  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: alg === 'HS512' ? 'SHA-512' : alg === 'HS384' ? 'SHA-384' : 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(signingInput))
  const sigB64 = base64UrlEncode(String.fromCharCode(...new Uint8Array(sig)))
  return `${signingInput}.${sigB64}`
}

function JwtEncoder() {
  const [headerText, setHeaderText] = useState(DEFAULT_HEADER)
  const [payloadText, setPayloadText] = useState(DEFAULT_PAYLOAD)
  const [secret, setSecret] = useState('')
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [building, setBuilding] = useState(false)

  const getAlg = (): string => {
    try { return (JSON.parse(headerText) as Record<string, unknown>).alg as string ?? 'HS256' } catch { return 'HS256' }
  }

  const generate = useCallback(async () => {
    setError(null)
    let headerJson: string
    let payloadJson: string
    try {
      headerJson = JSON.stringify(JSON.parse(headerText))
    } catch {
      setError('Header is not valid JSON')
      return
    }
    try {
      payloadJson = JSON.stringify(JSON.parse(payloadText))
    } catch {
      setError('Payload is not valid JSON')
      return
    }
    setBuilding(true)
    try {
      const t = await buildToken(headerJson, payloadJson, secret, getAlg())
      setToken(t)
    } catch (e) {
      setError(String(e))
    } finally {
      setBuilding(false)
    }
  }, [headerText, payloadText, secret])

  const alg = getAlg()
  const needsSecret = alg !== 'none'

  return (
    <div className="flex h-full min-h-0">
      {/* Left: inputs */}
      <div className="w-1/2 flex flex-col border-r border-border min-h-0 overflow-y-auto">
        <div className="px-4 py-2 border-b border-border shrink-0">
          <span className="text-sm font-medium">Header</span>
        </div>
        <textarea
          value={headerText}
          onChange={e => setHeaderText(e.target.value)}
          spellCheck={false}
          className="h-32 shrink-0 w-full bg-background border-b border-border p-3 font-mono text-xs resize-none focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
        />

        <div className="px-4 py-2 border-b border-border shrink-0">
          <span className="text-sm font-medium">Payload</span>
        </div>
        <textarea
          value={payloadText}
          onChange={e => setPayloadText(e.target.value)}
          spellCheck={false}
          className="flex-1 min-h-[8rem] w-full bg-background border-b border-border p-3 font-mono text-xs resize-none focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
        />

        <div className="px-4 py-2 border-b border-border shrink-0">
          <span className="text-sm font-medium text-[oklch(0.65_0.18_280)]">Secret</span>
          {!needsSecret && <span className="ml-2 text-xs text-muted-foreground">(not used — alg is &quot;none&quot;)</span>}
        </div>
        <input
          type="text"
          value={secret}
          onChange={e => setSecret(e.target.value)}
          placeholder={needsSecret ? 'your-secret-key' : 'N/A'}
          disabled={!needsSecret}
          className="shrink-0 w-full bg-background border-b border-border px-3 py-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground disabled:opacity-40"
        />

        <div className="px-4 py-3 shrink-0">
          <button
            onClick={generate}
            disabled={building}
            className="w-full text-xs font-medium py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {building ? 'Generating…' : 'Generate JWT'}
          </button>
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </div>
      </div>

      {/* Right: output */}
      <div className="w-1/2 flex flex-col min-h-0">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
          <span className="text-sm font-medium">Encoded</span>
          {token && <CopyButton text={token} />}
        </div>
        {token ? (
          <div className="flex-1 min-h-0 p-4 overflow-y-auto">
            {(() => {
              const parts = token.split('.')
              return (
                <div className="font-mono text-[11px] break-all leading-relaxed bg-background border border-border rounded-md p-3">
                  <span className="text-[oklch(0.75_0.18_25)]">{parts[0]}</span>
                  <span className="text-muted-foreground">.</span>
                  <span className="text-[oklch(0.75_0.18_160)]">{parts[1]}</span>
                  <span className="text-muted-foreground">.</span>
                  <span className="text-[oklch(0.65_0.18_280)]">{parts[2] ?? ''}</span>
                </div>
              )
            })()}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Fill in the fields and click Generate JWT
          </div>
        )}
      </div>
    </div>
  )
}

// ── Decoder ───────────────────────────────────────────────────────────────────

function JwtDecoderInner({ token, onTokenChange }: { token: string; onTokenChange: (v: string) => void }) {
  const parsed = token.trim() ? parseJwt(token) : null
  const parts = token.trim().split('.')
  const expired = parsed ? isExpired(parsed.payload as Record<string, unknown>) : null

  return (
    <div className="flex h-full min-h-0">
      {/* Left: input */}
      <div className="w-1/2 flex flex-col border-r border-border min-h-0">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
          <span className="text-sm font-medium text-foreground">Encoded</span>
          {token && (
            <button
              onClick={() => onTokenChange('')}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex flex-col flex-1 min-h-0 p-4 gap-3">
          <textarea
            value={token}
            onChange={e => onTokenChange(e.target.value)}
            placeholder="Paste a JWT here…"
            spellCheck={false}
            className="flex-1 min-h-0 w-full bg-background border border-border rounded-md p-3 font-mono text-xs resize-none focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground"
          />

          {token.trim() && (
            <div className="shrink-0 font-mono text-[11px] break-all leading-relaxed bg-background border border-border rounded-md p-3 max-h-28 overflow-y-auto">
              <span className="text-[oklch(0.75_0.18_25)]">{parts[0] ?? ''}</span>
              {parts[1] !== undefined && <><span className="text-muted-foreground">.</span><span className="text-[oklch(0.75_0.18_160)]">{parts[1]}</span></>}
              {parts[2] !== undefined && <><span className="text-muted-foreground">.</span><span className="text-[oklch(0.65_0.18_280)]">{parts[2]}</span></>}
            </div>
          )}

          {token.trim() && !parsed && (
            <p className="shrink-0 text-xs text-destructive">Invalid JWT — must have 3 base64url parts separated by dots.</p>
          )}
        </div>
      </div>

      {/* Right: decoded */}
      <div className="w-1/2 flex flex-col min-h-0">
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border shrink-0">
          <span className="text-sm font-medium text-foreground">Decoded</span>
          {parsed && expired !== null && (
            <span className={cn(
              'text-[11px] px-2 py-0.5 rounded border',
              expired
                ? 'border-destructive/40 bg-destructive/10 text-destructive'
                : 'border-primary/40 bg-primary/10 text-primary'
            )}>
              {expired ? 'Expired' : 'Valid'}
            </span>
          )}
        </div>

        {!parsed ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            {token.trim() ? 'Invalid token' : 'Paste a JWT on the left to decode it'}
          </div>
        ) : (
          <div className="flex-1 min-h-0 p-4 flex flex-col gap-4 overflow-y-auto">
            <Section
              label="Header"
              color="text-[oklch(0.75_0.18_25)]"
              copyText={JSON.stringify(parsed.header, null, 2)}
            >
              <JsonBlock data={parsed.header} />
            </Section>

            <Section
              label="Payload"
              color="text-[oklch(0.75_0.18_160)]"
              copyText={JSON.stringify(parsed.payload, null, 2)}
            >
              <JsonBlock data={parsed.payload} />
            </Section>

            <Section
              label="Signature"
              color="text-[oklch(0.65_0.18_280)]"
              copyText={parsed.signature}
            >
              <span className="text-[oklch(0.65_0.18_280)] font-mono">{parsed.signature}</span>
            </Section>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Public export ─────────────────────────────────────────────────────────────

export function JwtDecoder({ token, onTokenChange }: { token: string; onTokenChange: (v: string) => void }) {
  const [mode, setMode] = useState<'decode' | 'encode'>('decode')

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Tab bar */}
      <div className="flex items-center border-b border-border shrink-0 px-4 gap-4">
        {(['decode', 'encode'] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              'py-2 text-sm border-b-2 -mb-px transition-colors capitalize',
              mode === m
                ? 'border-primary text-foreground font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0">
        {mode === 'decode'
          ? <JwtDecoderInner token={token} onTokenChange={onTokenChange} />
          : <JwtEncoder />
        }
      </div>
    </div>
  )
}
