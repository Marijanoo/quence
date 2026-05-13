'use client'

import { useMemo } from 'react'

interface JsonViewerProps {
  data: string
  className?: string
}

export function JsonViewer({ data, className }: JsonViewerProps) {
  const highlighted = useMemo(() => {
    try {
      // Try to parse and re-format JSON
      const parsed = JSON.parse(data)
      const formatted = JSON.stringify(parsed, null, 2)
      return highlightJson(formatted)
    } catch {
      // If not valid JSON, return as-is with basic highlighting
      return highlightJson(data)
    }
  }, [data])

  return (
    <pre className={`code-editor whitespace-pre-wrap break-all ${className || ''}`}>
      <code dangerouslySetInnerHTML={{ __html: highlighted }} />
    </pre>
  )
}

function highlightJson(json: string): string {
  // Simple JSON syntax highlighting
  return json
    // Strings (must come first)
    .replace(/"([^"\\]|\\.)*"/g, (match) => {
      return `<span class="string">${escapeHtml(match)}</span>`
    })
    // Numbers
    .replace(/\b(-?\d+\.?\d*([eE][+-]?\d+)?)\b/g, '<span class="number">$1</span>')
    // Booleans
    .replace(/\b(true|false)\b/g, '<span class="boolean">$1</span>')
    // Null
    .replace(/\bnull\b/g, '<span class="null">null</span>')
    // Fix keys (strings followed by colon)
    .replace(/<span class="string">((?:"|&quot;).*?(?:"|&quot;))<\/span>(\s*:)/g, '<span class="key">$1</span>$2')
    // Punctuation (braces, brackets, commas) - using a negative lookahead to avoid matching inside tags
    .replace(/([\{\}\[\]\(\),])(?![^<]*>)/g, '<span class="punctuation">$1</span>')
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
