'use client'

import { useState, useCallback } from 'react'
import { Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

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

export function JwtDecoder({ token, onTokenChange }: { token: string; onTokenChange: (v: string) => void }) {
  const setToken = onTokenChange

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
              onClick={() => setToken('')}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex flex-col flex-1 min-h-0 p-4 gap-3">
          <textarea
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder="Paste a JWT here…"
            spellCheck={false}
            className="flex-1 min-h-0 w-full bg-background border border-border rounded-md p-3 font-mono text-xs resize-none focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground"
          />

          {/* Colour-coded raw token */}
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
