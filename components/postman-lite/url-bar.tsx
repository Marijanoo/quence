'use client'

import type { HttpMethod } from '@/lib/db/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Send, Loader2 } from 'lucide-react'
import { VariableHighlightInput } from './variable-highlight-input'
import { useEnvironmentContext } from './environment-context'

interface UrlBarProps {
  method: HttpMethod
  url: string
  onMethodChange: (method: HttpMethod) => void
  onUrlChange: (url: string) => void
  onSend: () => void
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
  method,
  url,
  onMethodChange,
  onUrlChange,
  onSend,
  isLoading,
}: UrlBarProps) {
  const { variables, updateVariable } = useEnvironmentContext()

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
          placeholder="Enter request URL"
          className="bg-secondary border-border"
          variables={variables}
          onUpdateVariable={updateVariable}
        />
      </div>

      <Button
        onClick={onSend}
        disabled={isLoading || !url}
        className="bg-primary text-primary-foreground hover:bg-primary/90 px-6"
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <Send className="h-4 w-4 mr-2" />
            Send
          </>
        )}
      </Button>
    </div>
  )
}
