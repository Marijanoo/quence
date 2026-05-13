'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import type { EnvironmentVariable } from '@/lib/db/types'
import { cn } from '@/lib/utils'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Check, X } from 'lucide-react'

// ─── Constants ───────────────────────────────────────────────────────────────

const FONT_SIZE = 13
const LINE_HEIGHT = 20 // px — must match CSS

// ─── JSON syntax highlighting ─────────────────────────────────────────────────

function tokenizeLine(line: string): React.ReactNode {
  // Split on JSON tokens while keeping delimiters
  const parts = line.split(/("(?:[^"\\]|\\.)*"|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[:,{}\[\]])/g)

  const nodes: React.ReactNode[] = []
  for (let i = 0; i < parts.length; i++) {
    const token = parts[i]
    if (!token) continue

    if (token.startsWith('"')) {
      // Key if the next meaningful token is ':'
      const next = parts[i + 1] ?? ''
      if (next.trimStart().startsWith(':')) {
        nodes.push(<span key={i} className="key">{token}</span>)
      } else {
        nodes.push(<span key={i} className="string">{token}</span>)
      }
    } else if (/^-?\d/.test(token)) {
      nodes.push(<span key={i} className="number">{token}</span>)
    } else if (token === 'true' || token === 'false') {
      nodes.push(<span key={i} className="boolean">{token}</span>)
    } else if (token === 'null') {
      nodes.push(<span key={i} className="null">{token}</span>)
    } else if (/^[:,{}\[\]]$/.test(token)) {
      nodes.push(<span key={i} className="punctuation">{token}</span>)
    } else {
      nodes.push(<span key={i}>{token}</span>)
    }
  }
  return <>{nodes}</>
}

// ─── Variable tag ─────────────────────────────────────────────────────────────

const VARIABLE_RE = /\{\{([^}]+)\}\}/g

interface VariableMatch {
  fullMatch: string
  variableName: string
  start: number
  end: number
}

function extractVars(text: string): VariableMatch[] {
  const out: VariableMatch[] = []
  VARIABLE_RE.lastIndex = 0
  let m
  while ((m = VARIABLE_RE.exec(text)) !== null) {
    out.push({ fullMatch: m[0], variableName: m[1].trim(), start: m.index, end: m.index + m[0].length })
  }
  return out
}

interface VariableTagProps {
  variableName: string
  fullMatch: string
  variables: EnvironmentVariable[]
  onUpdateVariable?: (key: string, value: string) => void
}

function VariableTag({ variableName, fullMatch, variables, onUpdateVariable }: VariableTagProps) {
  const [open, setOpen] = useState(false)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const variable = variables.find((v) => v.key === variableName && v.enabled)
  const resolved = !!variable
  const currentValue = variable?.value ?? ''

  useEffect(() => {
    if (open) { setEditValue(currentValue); setTimeout(() => inputRef.current?.focus(), 0) }
  }, [open, currentValue])

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  const save = () => { onUpdateVariable?.(variableName, editValue); setOpen(false) }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span
          onMouseEnter={() => { timerRef.current = setTimeout(() => setOpen(true), 500) }}
          onMouseLeave={() => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null } }}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'inline-block px-1 rounded cursor-pointer transition-colors',
            resolved
              ? 'bg-[oklch(0.45_0.15_160)] text-[oklch(0.9_0.1_160)] hover:bg-[oklch(0.5_0.15_160)]'
              : 'bg-[oklch(0.45_0.18_30)] text-[oklch(0.9_0.1_30)] hover:bg-[oklch(0.5_0.18_30)]',
          )}
          title={resolved ? `${variableName} = ${currentValue}` : `${variableName} (unresolved)`}
        >
          {fullMatch}
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{variableName}</span>
            <span className={cn('text-xs px-1.5 py-0.5 rounded', resolved ? 'bg-[oklch(0.35_0.12_160)] text-[oklch(0.85_0.1_160)]' : 'bg-[oklch(0.35_0.15_30)] text-[oklch(0.85_0.1_30)]')}>
              {resolved ? 'Resolved' : 'Unresolved'}
            </span>
          </div>
          {resolved && <div className="text-xs text-muted-foreground">Current: <span className="font-mono text-foreground">{currentValue}</span></div>}
          {onUpdateVariable && (
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">{resolved ? 'Update value:' : 'Set value:'}</label>
              <div className="flex items-center gap-2">
                <Input ref={inputRef} value={editValue} onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') save(); else if (e.key === 'Escape') setOpen(false) }}
                  placeholder="Enter value" className="h-8 text-sm font-mono flex-1" />
                <Button size="icon" variant="ghost" className="h-8 w-8 text-[oklch(0.7_0.15_160)]" onClick={save}><Check className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ─── Line renderer ────────────────────────────────────────────────────────────

interface LineProps {
  text: string
  language: 'json' | 'text'
  variables: EnvironmentVariable[]
  onUpdateVariable?: (key: string, value: string) => void
}

function renderLineContent({ text, language, variables, onUpdateVariable }: LineProps): React.ReactNode {
  const varMatches = extractVars(text)
  if (varMatches.length === 0) {
    return language === 'json' ? tokenizeLine(text) : <>{text}</>
  }

  const nodes: React.ReactNode[] = []
  let cursor = 0
  varMatches.forEach((m, i) => {
    if (m.start > cursor) {
      const seg = text.slice(cursor, m.start)
      nodes.push(<span key={`t${i}`}>{language === 'json' ? tokenizeLine(seg) : seg}</span>)
    }
    nodes.push(
      <VariableTag key={`v${i}`} variableName={m.variableName} fullMatch={m.fullMatch}
        variables={variables} onUpdateVariable={onUpdateVariable} />
    )
    cursor = m.end
  })
  if (cursor < text.length) {
    const seg = text.slice(cursor)
    nodes.push(<span key="te">{language === 'json' ? tokenizeLine(seg) : seg}</span>)
  }
  return <>{nodes}</>
}

// ─── Main component ───────────────────────────────────────────────────────────

interface VariableHighlightTextareaProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  variables: EnvironmentVariable[]
  onUpdateVariable?: (key: string, value: string) => void
  language?: 'json' | 'text'
}

export function VariableHighlightTextarea({
  value,
  onChange,
  placeholder,
  className,
  variables,
  onUpdateVariable,
  language = 'text',
}: VariableHighlightTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)   // the scrolling container
  const gutterRef = useRef<HTMLDivElement>(null)
  const [activeLine, setActiveLine] = useState(0)

  const lines = value.split('\n')
  const lineCount = lines.length

  // ── Scroll sync: textarea drives everything ──────────────────────────────
  const syncScroll = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return
    if (scrollRef.current) {
      scrollRef.current.scrollTop = ta.scrollTop
      scrollRef.current.scrollLeft = ta.scrollLeft
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = ta.scrollTop
    }
  }, [])

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.addEventListener('scroll', syncScroll)
    return () => ta.removeEventListener('scroll', syncScroll)
  }, [syncScroll])

  // ── Active line tracking ─────────────────────────────────────────────────
  const updateActiveLine = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return
    setActiveLine(ta.value.slice(0, ta.selectionStart).split('\n').length - 1)
  }, [])

  // ── Keyboard handling ────────────────────────────────────────────────────
  const pairs: Record<string, string> = { '{': '}', '[': ']', '(': ')', '"': '"', "'": "'" }
  const closers = new Set(Object.values(pairs))

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = textareaRef.current
    if (!ta) return
    const { selectionStart: ss, selectionEnd: se } = ta

    if (e.key === 'Enter') {
      e.preventDefault()
      const lineStart = value.lastIndexOf('\n', ss - 1) + 1
      const currentLine = value.slice(lineStart, ss)
      const indent = currentLine.match(/^\s*/)?.[0] ?? ''
      const extra = (currentLine.trimEnd().endsWith('{') || currentLine.trimEnd().endsWith('[')) ? '  ' : ''
      const next = value.slice(0, ss) + '\n' + indent + extra + value.slice(se)
      onChange(next)
      const pos = ss + 1 + indent.length + extra.length
      setTimeout(() => { ta.selectionStart = ta.selectionEnd = pos; updateActiveLine() }, 0)
      return
    }

    if (e.key === 'Tab') {
      e.preventDefault()
      onChange(value.slice(0, ss) + '  ' + value.slice(se))
      setTimeout(() => { ta.selectionStart = ta.selectionEnd = ss + 2 }, 0)
      return
    }

    // Skip over existing closer instead of inserting a new pair
    if (closers.has(e.key) && ss === se && value[ss] === e.key) {
      e.preventDefault()
      ta.selectionStart = ta.selectionEnd = ss + 1
      return
    }

    if (pairs[e.key]) {
      e.preventDefault()
      onChange(value.slice(0, ss) + e.key + pairs[e.key] + value.slice(se))
      setTimeout(() => { ta.selectionStart = ta.selectionEnd = ss + 1 }, 0)
      return
    }

    if (e.key === 'Backspace' && ss === se && ss > 0 && pairs[value[ss - 1]] === value[ss]) {
      e.preventDefault()
      onChange(value.slice(0, ss - 1) + value.slice(ss + 1))
      setTimeout(() => { ta.selectionStart = ta.selectionEnd = ss - 1 }, 0)
    }
  }

  // ── Gutter width ─────────────────────────────────────────────────────────
  const gutterWidth = Math.max(String(lineCount).length, 2) * 9 + 28

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      className={cn(
        'relative flex rounded-md border border-border overflow-hidden',
        'bg-[oklch(0.18_0.01_260)]',
        'min-h-[200px]',
        className,
      )}
      style={{ fontFamily: 'var(--font-mono)', fontSize: FONT_SIZE, lineHeight: `${LINE_HEIGHT}px` }}
    >
      {/* ── Gutter ── */}
      <div
        ref={gutterRef}
        className="flex-shrink-0 select-none overflow-hidden border-r border-border"
        style={{
          width: gutterWidth,
          background: 'oklch(0.15 0.01 260)',
          overflowY: 'hidden',
        }}
      >
        {/* top padding row */}
        <div style={{ height: 12 }} />
        {lines.map((_, i) => (
          <div
            key={i}
            style={{
              height: LINE_HEIGHT,
              lineHeight: `${LINE_HEIGHT}px`,
              paddingRight: 10,
              paddingLeft: 6,
              textAlign: 'right',
              color: i === activeLine ? 'var(--foreground)' : 'oklch(0.42 0 0)',
              background: i === activeLine ? 'oklch(0.22 0.01 260)' : 'transparent',
              transition: 'background 0.05s',
            }}
          >
            {i + 1}
          </div>
        ))}
      </div>

      {/* ── Editor pane ── */}
      <div className="relative flex-1 min-w-0">

        {/* Highlighted overlay — exact same layout as textarea */}
        <div
          ref={scrollRef}
          className="code-editor absolute inset-0 overflow-hidden pointer-events-none"
          style={{ padding: '12px 12px 12px 12px' }}
        >
          {/* Active line stripe — positioned relative to content top */}
          <div
            style={{
              position: 'absolute',
              top: 12 + activeLine * LINE_HEIGHT,
              left: 0,
              right: 0,
              height: LINE_HEIGHT,
              background: 'oklch(0.22 0.01 260)',
              pointerEvents: 'none',
            }}
          />

          {/* Per-line highlighted content */}
          {value === '' ? (
            <div style={{ color: 'var(--muted-foreground)', height: LINE_HEIGHT, lineHeight: `${LINE_HEIGHT}px` }}>
              {placeholder}
            </div>
          ) : (
            lines.map((line, i) => (
              <div key={i} style={{ height: LINE_HEIGHT, lineHeight: `${LINE_HEIGHT}px`, whiteSpace: 'pre', position: 'relative', zIndex: 1 }}>
                {renderLineContent({ text: line, language, variables, onUpdateVariable })}
              </div>
            ))
          )}
        </div>

        {/* Actual textarea — transparent text, visible caret */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => { onChange(e.target.value); updateActiveLine() }}
          onKeyDown={handleKeyDown}
          onClick={updateActiveLine}
          onKeyUp={updateActiveLine}
          onFocus={updateActiveLine}
          onScroll={syncScroll}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          className="absolute inset-0 w-full h-full resize-none bg-transparent outline-none border-none"
          style={{
            color: 'transparent',
            caretColor: 'var(--primary)',
            padding: '12px',
            fontFamily: 'var(--font-mono)',
            fontSize: FONT_SIZE,
            lineHeight: `${LINE_HEIGHT}px`,
            WebkitTextFillColor: 'transparent',
          }}
        />
      </div>
    </div>
  )
}
