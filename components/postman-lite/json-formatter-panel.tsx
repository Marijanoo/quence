'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { Copy, Check, AlertCircle, Search, ChevronUp, ChevronDown, X } from 'lucide-react'
import { computeFoldRanges, computeHiddenLines, foldSummary } from '@/lib/json-fold'

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

function tryFormat(input: string): { formatted: string; error: string | null } {
  if (!input.trim()) return { formatted: '', error: null }
  try {
    return { formatted: JSON.stringify(JSON.parse(input), null, 2), error: null }
  } catch (e) {
    return { formatted: '', error: (e as SyntaxError).message }
  }
}

// Split a line into segments, highlighting all occurrences of `query`
function highlightSegments(text: string, query: string, activeMatch: boolean, matchIndexInLine: number, activeIndexInLine: number) {
  if (!query) return [{ text, highlight: false, active: false }]
  const segments: { text: string; highlight: boolean; active: boolean }[] = []
  const lower = text.toLowerCase()
  const q = query.toLowerCase()
  let pos = 0
  let localIdx = matchIndexInLine
  while (pos < text.length) {
    const found = lower.indexOf(q, pos)
    if (found === -1) { segments.push({ text: text.slice(pos), highlight: false, active: false }); break }
    if (found > pos) segments.push({ text: text.slice(pos, found), highlight: false, active: false })
    const isActive = activeMatch && localIdx === activeIndexInLine
    segments.push({ text: text.slice(found, found + query.length), highlight: true, active: isActive })
    localIdx++
    pos = found + query.length
  }
  return segments
}

function JsonSegment({ text, highlight, active }: { text: string; highlight: boolean; active: boolean }) {
  if (!highlight) return <>{text}</>
  return (
    <mark className={active
      ? 'bg-primary text-primary-foreground rounded-[2px]'
      : 'bg-primary/30 text-foreground rounded-[2px]'
    }>{text}</mark>
  )
}

// Count matches in a string
function countMatches(text: string, query: string): number {
  if (!query) return 0
  let count = 0
  let pos = 0
  const lower = text.toLowerCase()
  const q = query.toLowerCase()
  while ((pos = lower.indexOf(q, pos)) !== -1) { count++; pos += q.length }
  return count
}

function renderWithHighlight(text: string, query: string, globalMatchOffset: number, activeMatch: number) {
  if (!query) return <>{text}</>
  const segs = highlightSegments(text, query, true, globalMatchOffset, activeMatch)
  return <>{segs.map((s, i) => <JsonSegment key={i} {...s} />)}</>
}

interface LineProps {
  line: string
  query: string
  matchOffset: number   // how many matches appeared before this line
  activeMatch: number   // 0-based index of the active match overall
}

function JsonLineHighlighted({ line, query, matchOffset, activeMatch }: LineProps) {
  const renderPart = (text: string, offset: number) =>
    renderWithHighlight(text, query, offset, activeMatch)

  // Count matches per part so offsets are correct
  const keyMatch = line.match(/^(\s*)("(?:[^"\\]|\\.)*")(\s*:\s*)(.*)$/)
  if (keyMatch) {
    const [, indent, key, colon, rest] = keyMatch
    const keyCount = countMatches(key, query)
    const colonCount = countMatches(colon, query)
    return (
      <span>
        {renderPart(indent, matchOffset)}
        <span style={{ color: 'var(--json-key)' }}>{renderPart(key, matchOffset)}</span>
        <span className="text-muted-foreground">{renderPart(colon, matchOffset + keyCount)}</span>
        <JsonValueHighlighted raw={rest} query={query} matchOffset={matchOffset + keyCount + colonCount} activeMatch={activeMatch} />
      </span>
    )
  }
  return <span><JsonValueHighlighted raw={line} query={query} matchOffset={matchOffset} activeMatch={activeMatch} /></span>
}

function JsonValueHighlighted({ raw, query, matchOffset, activeMatch }: { raw: string; query: string; matchOffset: number; activeMatch: number }) {
  const trimmed = raw.trimEnd()
  const trailing = raw.slice(trimmed.length)
  const r = (text: string, off: number) => renderWithHighlight(text, query, off, activeMatch)

  if (trimmed === 'null') return <><span className="text-muted-foreground">{r('null', matchOffset)}</span>{trailing}</>
  if (trimmed === 'true' || trimmed === 'false') return <><span style={{ color: 'var(--json-boolean)' }}>{r(trimmed, matchOffset)}</span>{trailing}</>
  if (['{', '}', '[', ']', '{}', '[]', '{,', '},', '],'].includes(trimmed)) {
    return <><span className="text-muted-foreground">{r(trimmed, matchOffset)}</span>{trailing}</>
  }
  const numMatch = trimmed.match(/^(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)(,?)$/)
  if (numMatch) {
    const n1count = countMatches(numMatch[1], query)
    return <>
      <span style={{ color: 'var(--json-number)' }}>{r(numMatch[1], matchOffset)}</span>
      <span className="text-muted-foreground">{r(numMatch[2], matchOffset + n1count)}</span>
      {trailing}
    </>
  }
  const strMatch = trimmed.match(/^("(?:[^"\\]|\\.)*")(,?)$/)
  if (strMatch) {
    const s1count = countMatches(strMatch[1], query)
    return <>
      <span style={{ color: 'var(--json-string)' }}>{r(strMatch[1], matchOffset)}</span>
      <span className="text-muted-foreground">{r(strMatch[2], matchOffset + s1count)}</span>
      {trailing}
    </>
  }
  return <span className="text-foreground">{r(raw, matchOffset)}</span>
}

export function JsonFormatter({ input, onInputChange }: { input: string; onInputChange: (v: string) => void }) {
  const setInput = onInputChange
  const [query, setQuery] = useState('')
  const [activeMatch, setActiveMatch] = useState(0)
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const searchRef = useRef<HTMLInputElement>(null)
  const activeMatchRef = useRef<HTMLElement | null>(null)
  const outputRef = useRef<HTMLDivElement>(null)

  const { formatted, error } = tryFormat(input)
  const lines = useMemo(() => formatted ? formatted.split('\n') : [], [formatted])

  // Reset fold state when content changes
  useEffect(() => { setCollapsed(new Set()) }, [formatted])

  const foldRanges = useMemo(() => computeFoldRanges(lines), [lines])
  const hiddenLines = useMemo(() => computeHiddenLines(collapsed, foldRanges, lines.length), [collapsed, foldRanges, lines.length])

  const toggleFold = useCallback((lineIdx: number) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(lineIdx)) next.delete(lineIdx)
      else next.add(lineIdx)
      return next
    })
  }, [])

  // Visible lines for search (exclude hidden)
  const visibleLines = useMemo(() => lines.filter((_, i) => !hiddenLines.has(i)), [lines, hiddenLines])

  // Per-line match counts and cumulative offsets (over visible lines only)
  const { lineCounts, lineOffsets, totalMatches } = useMemo(() => {
    if (!query) return { lineCounts: [], lineOffsets: [], totalMatches: 0 }
    const counts = lines.map((l, i) => hiddenLines.has(i) ? 0 : countMatches(l, query))
    const offsets: number[] = []
    let cum = 0
    for (const c of counts) { offsets.push(cum); cum += c }
    return { lineCounts: counts, lineOffsets: offsets, totalMatches: cum }
  }, [lines, hiddenLines, query])

  useEffect(() => {
    if (totalMatches === 0) setActiveMatch(0)
    else setActiveMatch(prev => Math.min(prev, totalMatches - 1))
  }, [totalMatches])

  useEffect(() => {
    if (activeMatchRef.current) {
      activeMatchRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [activeMatch, query])

  const prev = useCallback(() => setActiveMatch(m => (m - 1 + totalMatches) % totalMatches), [totalMatches])
  const next = useCallback(() => setActiveMatch(m => (m + 1) % totalMatches), [totalMatches])

  const handleSearchKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.shiftKey ? prev() : next() }
    if (e.key === 'Escape') { setQuery(''); searchRef.current?.blur() }
  }, [prev, next])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'f' && formatted) {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [formatted])

  return (
    <div className="flex h-full min-h-0">

      {/* Left: input */}
      <div className="w-1/2 flex flex-col border-r border-border min-h-0">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
          <span className="text-sm font-medium text-foreground">Input</span>
          {input && (
            <button onClick={() => setInput('')} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Clear
            </button>
          )}
        </div>
        <textarea
          value={input}
          onChange={e => { setInput(e.target.value); setActiveMatch(0) }}
          placeholder="Paste JSON here…"
          spellCheck={false}
          className="flex-1 min-h-0 w-full bg-background p-4 font-mono text-xs resize-none focus:outline-none text-foreground placeholder:text-muted-foreground"
        />
      </div>

      {/* Right: formatted output */}
      <div className="w-1/2 flex flex-col min-h-0">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
          <span className="text-sm font-medium text-foreground shrink-0">Formatted</span>
          {formatted && (
            <>
              <div className="flex items-center flex-1 gap-1 bg-background border border-border rounded px-2 h-6 min-w-0">
                <Search className="h-3 w-3 text-muted-foreground shrink-0" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={e => { setQuery(e.target.value); setActiveMatch(0) }}
                  onKeyDown={handleSearchKey}
                  placeholder="Search… (Ctrl+F)"
                  className="flex-1 bg-transparent text-xs focus:outline-none text-foreground placeholder:text-muted-foreground min-w-0"
                />
                {query && (
                  <>
                    <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
                      {totalMatches === 0 ? '0/0' : `${activeMatch + 1}/${totalMatches}`}
                    </span>
                    <button onClick={prev} disabled={totalMatches === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5">
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button onClick={next} disabled={totalMatches === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5">
                      <ChevronDown className="h-3 w-3" />
                    </button>
                    <button onClick={() => setQuery('')} className="text-muted-foreground hover:text-foreground p-0.5">
                      <X className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>
              <CopyButton text={formatted} />
            </>
          )}
        </div>

        {!input.trim() ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Paste JSON on the left to format it
          </div>
        ) : error ? (
          <div className="flex-1 p-4">
            <div className="flex items-start gap-2 text-destructive text-xs">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="font-mono">{error}</span>
            </div>
          </div>
        ) : (
          <div ref={outputRef} className="flex-1 min-h-0 overflow-auto p-4">
            <pre className="font-mono text-xs leading-relaxed">
              {(() => {
                const lineNumWidth = String(lines.length).length
                return lines.map((line, i) => {
                  if (hiddenLines.has(i)) return null

                  const offset = lineOffsets[i] ?? 0
                  const count = lineCounts[i] ?? 0
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
                      ref={hasActive ? (el => { activeMatchRef.current = el }) : undefined}
                      className="group flex items-start"
                    >
                      {/* Line number */}
                      <span
                        className="shrink-0 select-none text-right text-muted-foreground/40 mr-3 tabular-nums"
                        style={{ width: `${lineNumWidth}ch` }}
                      >
                        {i + 1}
                      </span>
                      {/* Fold gutter */}
                      <span
                        className={`inline-block w-4 shrink-0 text-center select-none cursor-default mr-1 ${
                          isFoldable ? 'text-muted-foreground hover:text-foreground cursor-pointer' : ''
                        }`}
                        onClick={isFoldable ? () => toggleFold(i) : undefined}
                        title={isFoldable ? (isCollapsed ? 'Expand' : 'Collapse') : undefined}
                      >
                        {isFoldable ? (isCollapsed ? '▶' : '▼') : ''}
                      </span>
                      <span className="flex-1">
                        {isCollapsed ? (
                          <span
                            className="cursor-pointer"
                            onClick={() => toggleFold(i)}
                          >
                            <JsonLineHighlighted line={displayLine} query={query} matchOffset={offset} activeMatch={activeMatch} />
                          </span>
                        ) : (
                          <JsonLineHighlighted line={displayLine} query={query} matchOffset={offset} activeMatch={activeMatch} />
                        )}
                      </span>
                    </div>
                  )
                })
              })()}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}
