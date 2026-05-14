'use client'

import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { SearchBar } from './search-bar'

interface CodeViewerProps {
  data: string
  language?: 'json' | 'html' | 'auto'
  className?: string
}

export function CodeViewer({ data, language = 'auto', className }: CodeViewerProps) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [currentMatch, setCurrentMatch] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const activeMatchRef = useRef<HTMLElement | null>(null)

  const highlighted = useMemo(() => {
    let mode = language
    if (mode === 'auto') {
      const trimmed = data.trimStart()
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        mode = 'json'
      } else if (trimmed.startsWith('<')) {
        mode = 'html'
      } else {
        mode = 'json'
      }
    }

    try {
      if (mode === 'json') {
        try {
          const parsed = JSON.parse(data)
          return highlightJson(JSON.stringify(parsed, null, 2))
        } catch {
          return highlightJson(data)
        }
      } else {
        return highlightHtml(data)
      }
    } catch {
      return escapeHtml(data)
    }
  }, [data, language])

  // Count occurrences of query in the plain text
  const matchCount = useMemo(() => {
    if (!query) return 0
    const lower = data.toLowerCase()
    const q = query.toLowerCase()
    let count = 0
    let idx = 0
    while ((idx = lower.indexOf(q, idx)) !== -1) { count++; idx += q.length }
    return count
  }, [data, query])

  // Clamp currentMatch when matchCount changes
  useEffect(() => {
    if (matchCount === 0) setCurrentMatch(0)
    else setCurrentMatch(prev => Math.min(prev, matchCount - 1))
  }, [matchCount])

  // Build highlighted HTML with search marks
  const displayHtml = useMemo(() => {
    if (!query || matchCount === 0) return highlighted

    // We operate on the already-syntax-highlighted HTML string and wrap plain-text matches.
    // Strategy: collect match positions in the raw `data`, then map them into the HTML.
    // Simpler: strip tags to find positions, then inject <mark> tags carefully.
    // Because the HTML has entity-encoded content we use a DOM-free approach:
    // we walk the highlighted HTML and inject marks around text nodes only.
    return injectSearchMarks(highlighted, query, currentMatch)
  }, [highlighted, query, currentMatch, matchCount])

  // Scroll active mark into view
  useEffect(() => {
    if (!searchOpen || !query) return
    const el = containerRef.current?.querySelector<HTMLElement>('.search-match-active')
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      activeMatchRef.current = el
    }
  }, [displayHtml, searchOpen, query])

  const openSearch = useCallback(() => { setSearchOpen(true) }, [])
  const closeSearch = useCallback(() => { setSearchOpen(false); setQuery(''); setCurrentMatch(0) }, [])

  const handleNext = useCallback(() => {
    setCurrentMatch(prev => (prev + 1) % (matchCount || 1))
  }, [matchCount])

  const handlePrev = useCallback(() => {
    setCurrentMatch(prev => (prev - 1 + (matchCount || 1)) % (matchCount || 1))
  }, [matchCount])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault()
      openSearch()
    }
  }, [openSearch])

  return (
    <div
      ref={containerRef}
      className={`relative outline-none ${className || ''}`}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
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
      <pre className={`code-editor whitespace-pre-wrap break-all`}>
        <code dangerouslySetInnerHTML={{ __html: displayHtml }} />
      </pre>
    </div>
  )
}

// ── Search mark injection ─────────────────────────────────────────────────────

function injectSearchMarks(html: string, query: string, activeIndex: number): string {
  const q = query.toLowerCase()
  let matchIndex = 0
  let result = ''
  let i = 0

  while (i < html.length) {
    if (html[i] === '<') {
      // Skip HTML tag
      const end = html.indexOf('>', i)
      if (end === -1) { result += html.slice(i); break }
      result += html.slice(i, end + 1)
      i = end + 1
      continue
    }

    if (html[i] === '&') {
      // HTML entity — treat as one logical character
      const semi = html.indexOf(';', i)
      if (semi === -1) { result += html[i]; i++; continue }
      const entity = html.slice(i, semi + 1)
      // decode single char for matching
      const decoded = decodeEntity(entity)
      if (decoded.toLowerCase() === q[0] && matchesAtEntity(html, i, q)) {
        // Find full entity span for the match
        const { htmlSpan, nextI } = consumeEntityMatch(html, i, q.length)
        const cls = matchIndex === activeIndex ? 'search-match-active' : 'search-match'
        result += `<mark class="${cls}">${htmlSpan}</mark>`
        matchIndex++
        i = nextI
      } else {
        result += entity
        i = semi + 1
      }
      continue
    }

    // Plain character
    const lower = getDecodedChar(html, i).toLowerCase()
    if (lower === q[0] && matchesAtPlain(html, i, q)) {
      const { htmlSpan, nextI } = consumePlainMatch(html, i, q.length)
      const cls = matchIndex === activeIndex ? 'search-match-active' : 'search-match'
      result += `<mark class="${cls}">${htmlSpan}</mark>`
      matchIndex++
      i = nextI
    } else {
      result += html[i]
      i++
    }
  }

  return result
}

// Match query against HTML at position i, skipping tags, decoding entities
function matchesAtPlain(html: string, start: number, query: string): boolean {
  const chars = extractLogicalChars(html, start, query.length)
  return chars.toLowerCase() === query.toLowerCase()
}

function matchesAtEntity(html: string, start: number, query: string): boolean {
  const chars = extractLogicalChars(html, start, query.length)
  return chars.toLowerCase() === query.toLowerCase()
}

// Extract `count` logical (decoded) characters starting at html[pos], skipping tags
function extractLogicalChars(html: string, pos: number, count: number): string {
  let result = ''
  let i = pos
  while (result.length < count && i < html.length) {
    if (html[i] === '<') {
      const end = html.indexOf('>', i)
      if (end === -1) break
      i = end + 1
      continue
    }
    if (html[i] === '&') {
      const semi = html.indexOf(';', i)
      if (semi === -1) { result += html[i]; i++; continue }
      result += decodeEntity(html.slice(i, semi + 1))
      i = semi + 1
      continue
    }
    result += html[i]
    i++
  }
  return result
}

function getDecodedChar(html: string, i: number): string {
  return html[i]
}

// Consume `count` logical characters from html[start], returning the HTML span and next position
function consumePlainMatch(html: string, start: number, count: number): { htmlSpan: string; nextI: number } {
  let consumed = 0
  let i = start
  let htmlSpan = ''
  while (consumed < count && i < html.length) {
    if (html[i] === '<') {
      const end = html.indexOf('>', i)
      if (end === -1) break
      htmlSpan += html.slice(i, end + 1)
      i = end + 1
      continue
    }
    if (html[i] === '&') {
      const semi = html.indexOf(';', i)
      if (semi === -1) { htmlSpan += html[i]; i++; consumed++; continue }
      htmlSpan += html.slice(i, semi + 1)
      i = semi + 1
      consumed++
      continue
    }
    htmlSpan += html[i]
    i++
    consumed++
  }
  return { htmlSpan, nextI: i }
}

function consumeEntityMatch(html: string, start: number, count: number): { htmlSpan: string; nextI: number } {
  return consumePlainMatch(html, start, count)
}

function decodeEntity(entity: string): string {
  const map: Record<string, string> = {
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#039;': "'"
  }
  return map[entity] ?? entity.slice(1, -1)
}

// ── Syntax highlighting (unchanged) ──────────────────────────────────────────

function highlightJson(json: string): string {
  return json
    .replace(/"([^"\\]|\\.)*"/g, (match) => `<span class="string">${escapeHtml(match)}</span>`)
    .replace(/\b(-?\d+\.?\d*([eE][+-]?\d+)?)\b/g, '<span class="number">$1</span>')
    .replace(/\b(true|false)\b/g, '<span class="boolean">$1</span>')
    .replace(/\bnull\b/g, '<span class="null">null</span>')
    .replace(/<span class="string">((?:"|&quot;).*?(?:"|&quot;))<\/span>(\s*:)/g, '<span class="key">$1</span>$2')
    .replace(/([\{\}\[\]\(\),])(?![^<]*>)/g, '<span class="punctuation">$1</span>')
}

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
