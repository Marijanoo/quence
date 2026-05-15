'use client'

import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { SearchBar } from './search-bar'
import { computeFoldRanges, computeHiddenLines, foldSummary } from '@/lib/json-fold'

interface CodeViewerProps {
  data: string
  language?: 'json' | 'html' | 'auto'
  className?: string
}

// ── JSON token types ──────────────────────────────────────────────────────────

type Token = { type: 'key' | 'string' | 'number' | 'boolean' | 'null' | 'punctuation' | 'plain'; text: string }

function tokenizeLine(line: string): Token[] {
  // Split on JSON tokens, keeping delimiters
  const parts = line.split(/("(?:[^"\\]|\\.)*"|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[:,{}\[\]])/g)
  const tokens: Token[] = []
  for (let i = 0; i < parts.length; i++) {
    const t = parts[i]
    if (!t) continue
    if (t.startsWith('"')) {
      let j = i + 1
      while (j < parts.length && parts[j].trim() === '') j++
      const nextToken = parts[j] ?? ''
      tokens.push({ type: nextToken === ':' ? 'key' : 'string', text: t })
    } else if (/^-?\d/.test(t)) {
      tokens.push({ type: 'number', text: t })
    } else if (t === 'true' || t === 'false') {
      tokens.push({ type: 'boolean', text: t })
    } else if (t === 'null') {
      tokens.push({ type: 'null', text: t })
    } else if (/^[:,{}\[\]]$/.test(t)) {
      tokens.push({ type: 'punctuation', text: t })
    } else {
      tokens.push({ type: 'plain', text: t })
    }
  }
  return tokens
}

function TokenSpan({ token }: { token: Token }) {
  const style: React.CSSProperties = {}
  if (token.type === 'key') style.color = 'var(--json-key)'
  else if (token.type === 'string') style.color = 'var(--json-string)'
  else if (token.type === 'number') style.color = 'var(--json-number)'
  else if (token.type === 'boolean') style.color = 'var(--json-boolean)'
  else if (token.type === 'null' || token.type === 'punctuation') style.color = 'var(--muted-foreground)'
  return <span style={style}>{token.text}</span>
}

function highlightLineWithSearch(line: string, query: string, matchOffset: number, activeMatch: number): React.ReactNode {
  if (!query) {
    const tokens = tokenizeLine(line)
    return <>{tokens.map((t, i) => <TokenSpan key={i} token={t} />)}</>
  }
  // With search: highlight matches on top of syntax coloring
  const q = query.toLowerCase()
  const lower = line.toLowerCase()
  const nodes: React.ReactNode[] = []
  let pos = 0
  let idx = matchOffset
  while (pos < line.length) {
    const found = lower.indexOf(q, pos)
    if (found === -1) {
      const seg = line.slice(pos)
      const tokens = tokenizeLine(seg)
      tokens.forEach((t, i) => nodes.push(<TokenSpan key={`${pos}-${i}`} token={t} />))
      break
    }
    if (found > pos) {
      const seg = line.slice(pos, found)
      const tokens = tokenizeLine(seg)
      tokens.forEach((t, i) => nodes.push(<TokenSpan key={`${pos}-${i}`} token={t} />))
    }
    const isActive = idx === activeMatch
    nodes.push(
      <mark key={found} className={isActive ? 'bg-primary text-primary-foreground rounded-[2px]' : 'bg-primary/30 text-foreground rounded-[2px]'}>
        {line.slice(found, found + query.length)}
      </mark>
    )
    idx++
    pos = found + query.length
  }
  return <>{nodes}</>
}

function countMatches(text: string, query: string): number {
  if (!query) return 0
  let count = 0, pos = 0
  const lower = text.toLowerCase(), q = query.toLowerCase()
  while ((pos = lower.indexOf(q, pos)) !== -1) { count++; pos += q.length }
  return count
}

// ── HTML viewer (unchanged dangerouslySetInnerHTML) ───────────────────────────

function HtmlViewer({ data }: { data: string }) {
  const highlighted = useMemo(() => highlightHtml(data), [data])
  return (
    <pre className="code-editor whitespace-pre-wrap break-all">
      <code dangerouslySetInnerHTML={{ __html: highlighted }} />
    </pre>
  )
}

// ── JSON viewer with folding ───────────────────────────────────────────────────

function JsonViewer({ data, query, activeMatch, activeMatchRef }: {
  data: string
  query: string
  activeMatch: number
  activeMatchRef: React.RefObject<HTMLElement | null>
}) {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())

  const lines = useMemo(() => {
    try { return JSON.stringify(JSON.parse(data), null, 2).split('\n') }
    catch { return data.split('\n') }
  }, [data])

  useEffect(() => { setCollapsed(new Set()) }, [data])

  const foldRanges = useMemo(() => computeFoldRanges(lines), [lines])
  const hiddenLines = useMemo(() => computeHiddenLines(collapsed, foldRanges, lines.length), [collapsed, foldRanges, lines.length])

  const lineOffsets = useMemo(() => {
    const offsets: number[] = []
    let cum = 0
    for (let i = 0; i < lines.length; i++) {
      offsets.push(cum)
      if (!hiddenLines.has(i)) cum += countMatches(lines[i], query)
    }
    return offsets
  }, [lines, hiddenLines, query])

  const toggleFold = useCallback((i: number) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i); else next.add(i)
      return next
    })
  }, [])

  return (
    <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
      {lines.map((line, i) => {
        if (hiddenLines.has(i)) return null
        const offset = lineOffsets[i] ?? 0
        const count = countMatches(line, query)
        const localActive = activeMatch - offset
        const hasActive = !!query && localActive >= 0 && localActive < count
        const isFoldable = foldRanges.has(i)
        const isCollapsed = collapsed.has(i)
        const closer = foldRanges.get(i)
        const displayLine = isCollapsed && closer !== undefined
          ? foldSummary(line, lines[closer], closer - i - 1)
          : line

        return (
          <div
            key={i}
            ref={hasActive ? (el => { (activeMatchRef as React.MutableRefObject<HTMLElement | null>).current = el }) : undefined}
            className="flex items-start"
          >
            <span
              className={`inline-block w-4 shrink-0 text-center select-none mr-1 ${isFoldable ? 'text-muted-foreground hover:text-foreground cursor-pointer' : 'cursor-default'}`}
              onClick={isFoldable ? () => toggleFold(i) : undefined}
            >
              {isFoldable ? (isCollapsed ? '▶' : '▼') : ''}
            </span>
            <span
              className={isCollapsed ? 'flex-1 cursor-pointer' : 'flex-1'}
              onClick={isCollapsed ? () => toggleFold(i) : undefined}
            >
              {highlightLineWithSearch(displayLine, query, offset, activeMatch)}
            </span>
          </div>
        )
      })}
    </pre>
  )
}

// ── Main CodeViewer ───────────────────────────────────────────────────────────

export function CodeViewer({ data, language = 'auto', className }: CodeViewerProps) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [currentMatch, setCurrentMatch] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const activeMatchRef = useRef<HTMLElement | null>(null)

  const isJson = useMemo(() => {
    if (language === 'json') return true
    if (language === 'html') return false
    const trimmed = data.trimStart()
    return trimmed.startsWith('{') || trimmed.startsWith('[')
  }, [data, language])

  const matchCount = useMemo(() => {
    if (!query || !isJson) return 0
    try {
      const formatted = JSON.stringify(JSON.parse(data), null, 2)
      return countMatches(formatted, query)
    } catch {
      return countMatches(data, query)
    }
  }, [data, query, isJson])

  useEffect(() => {
    if (matchCount === 0) setCurrentMatch(0)
    else setCurrentMatch(prev => Math.min(prev, matchCount - 1))
  }, [matchCount])

  useEffect(() => {
    if (!searchOpen || !query) return
    activeMatchRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [currentMatch, searchOpen, query])

  const openSearch = useCallback(() => setSearchOpen(true), [])
  const closeSearch = useCallback(() => { setSearchOpen(false); setQuery(''); setCurrentMatch(0) }, [])
  const handleNext = useCallback(() => setCurrentMatch(prev => (prev + 1) % (matchCount || 1)), [matchCount])
  const handlePrev = useCallback(() => setCurrentMatch(prev => (prev - 1 + (matchCount || 1)) % (matchCount || 1)), [matchCount])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); openSearch() }
  }, [openSearch])

  return (
    <div ref={containerRef} className={`relative outline-none ${className || ''}`} tabIndex={0} onKeyDown={handleKeyDown}>
      {searchOpen && (
        <div className="sticky top-0 z-10">
          <SearchBar
            query={query}
            onQueryChange={(q) => { setQuery(q); setCurrentMatch(0) }}
            matchCount={matchCount}
            currentMatch={currentMatch}
            onNext={handleNext}
            onPrev={handlePrev}
            onClose={closeSearch}
          />
        </div>
      )}
      {isJson ? (
        <div className="p-4">
          <JsonViewer data={data} query={searchOpen ? query : ''} activeMatch={currentMatch} activeMatchRef={activeMatchRef} />
        </div>
      ) : (
        <HtmlViewer data={data} />
      )}
    </div>
  )
}

// ── HTML highlighting ─────────────────────────────────────────────────────────

function highlightHtml(html: string): string {
  return escapeHtml(html)
    .replace(/&lt;!--[\s\S]*?--&gt;/g, '<span class="null">$0</span>')
    .replace(/&lt;(\/?[a-zA-Z0-9]+)(\s?)/g, '&lt;<span class="key">$1</span>$2')
    .replace(/(\s)([a-zA-Z0-9-]+)(=)/g, '$1<span class="number">$2</span>$3')
    .replace(/(&quot;.*?&quot;)/g, '<span class="string">$1</span>')
    .replace(/(\/?)(&gt;)/g, '<span class="punctuation">$1$2</span>')
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
