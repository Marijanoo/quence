'use client'

import type { HttpMethod, RequestConfig } from '@/lib/db/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Send, Loader2, Copy, Check, X } from 'lucide-react'
import { VariableHighlightInput } from './variable-highlight-input'
import { useEnvironmentContext } from './environment-context'
import { isCurlCommand, parseCurl, buildCurl } from '@/lib/curl-parser'
import { parseVariables } from '@/lib/variable-parser'
import { useState } from 'react'

interface UrlBarProps {
  request: RequestConfig
  onMethodChange: (method: HttpMethod) => void
  onUrlChange: (url: string) => void
  onCurlImport: (updates: Partial<RequestConfig>) => void
  onSend: () => void
  onCancel: () => void
  isLoading: boolean
}

const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

const methodColors: Record<HttpMethod, string> = {
  GET: 'text-[oklch(0.72_0.19_160)]',
  POST: 'text-[oklch(0.75_0.18_80)]',
  PUT: 'text-[oklch(0.65_0.2_250)]',
  PATCH: 'text-[oklch(0.7_0.15_300)]',
  DELETE: 'text-[oklch(0.65_0.22_25)]',
  HEAD: 'text-[oklch(0.6_0.12_200)]',
  OPTIONS: 'text-muted-foreground',
}

export function UrlBar({
  request,
  onMethodChange,
  onUrlChange,
  onCurlImport,
  onSend,
  onCancel,
  isLoading,
}: UrlBarProps) {
  const { variables, updateVariable } = useEnvironmentContext()
  const [copied, setCopied] = useState(false)

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text')
    if (!isCurlCommand(text)) return
    e.preventDefault()
    const parsed = parseCurl(text)
    if (parsed) onCurlImport(parsed)
  }

  const handleCopyCurl = async () => {
    const pv = (s: string) => parseVariables(s, variables)
    const resolved: RequestConfig = {
      ...request,
      url: pv(request.url),
      params: request.params.map(p => ({ ...p, key: pv(p.key), value: pv(p.value) })),
      headers: request.headers.map(h => ({ ...h, key: pv(h.key), value: pv(h.value) })),
      body: {
        ...request.body,
        content: pv(request.body.content),
        formData: request.body.formData?.map(f => ({ ...f, key: pv(f.key), value: pv(f.value) })),
      },
      auth: resolveAuth(request.auth, pv),
    }
    const curl = buildCurl(resolved)
    await navigator.clipboard.writeText(curl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const { method, url } = request

  return (
    <div className="flex items-center gap-2 p-4 border-b border-border">
      <Select value={method} onValueChange={(v) => onMethodChange(v as HttpMethod)}>
        <SelectTrigger className="w-[120px] bg-secondary border-border">
          <SelectValue>
            <span className={cn('font-semibold font-mono text-sm', methodColors[method])}>
              {method}
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {methods.map((m) => (
            <SelectItem key={m} value={m}>
              <span className={cn('font-semibold font-mono text-sm', methodColors[m])}>
                {m}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex-1">
        <VariableHighlightInput
          value={url}
          onChange={onUrlChange}
          onPaste={handlePaste}
          placeholder="Enter request URL or paste a curl command"
          className="bg-secondary border-border"
          variables={variables}
          onUpdateVariable={updateVariable}
        />
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={handleCopyCurl}
        disabled={!url}
        title="Copy as cURL"
        className="shrink-0 text-muted-foreground hover:text-foreground"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>

      {isLoading ? (
        <Button
          onClick={onCancel}
          variant="destructive"
          className="px-6"
        >
          <X className="h-4 w-4 mr-2" />
          Cancel
        </Button>
      ) : (
        <Button
          onClick={onSend}
          disabled={!url}
          className="bg-primary text-primary-foreground hover:bg-primary/90 px-6"
        >
          <Send className="h-4 w-4 mr-2" />
          Send
        </Button>
      )}
    </div>
  )
}

function resolveAuth(auth: RequestConfig['auth'], pv: (s: string) => string): RequestConfig['auth'] {
  if (auth.type === 'bearer' && auth.bearer) {
    return { ...auth, bearer: { token: pv(auth.bearer.token) } }
  }
  if (auth.type === 'basic' && auth.basic) {
    return { ...auth, basic: { username: pv(auth.basic.username), password: pv(auth.basic.password) } }
  }
  if (auth.type === 'api-key' && auth.apiKey) {
    return { ...auth, apiKey: { ...auth.apiKey, key: pv(auth.apiKey.key), value: pv(auth.apiKey.value) } }
  }
  return auth
}
