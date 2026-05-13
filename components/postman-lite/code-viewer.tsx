'use client'

import { useMemo } from 'react'

interface CodeViewerProps {
  data: string
  language?: 'json' | 'html' | 'auto'
  className?: string
}

export function CodeViewer({ data, language = 'auto', className }: CodeViewerProps) {
  const highlighted = useMemo(() => {
    let mode = language
    if (mode === 'auto') {
      const trimmed = data.trimStart()
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        mode = 'json'
      } else if (trimmed.startsWith('<')) {
        mode = 'html'
      } else {
        mode = 'json' // Fallback
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

  return (
    <pre className={`code-editor whitespace-pre-wrap break-all ${className || ''}`}>
      <code dangerouslySetInnerHTML={{ __html: highlighted }} />
    </pre>
  )
}

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
    // Comments
    .replace(/&lt;!--[\s\S]*?--&gt;/g, '<span class="null">$0</span>')
    // Tags
    .replace(/&lt;(\/?[a-zA-Z0-9]+)(\s?)/g, '&lt;<span class="key">$1</span>$2')
    // Attributes
    .replace(/(\s)([a-zA-Z0-9-]+)(=)/g, '$1<span class="number">$2</span>$3')
    // Attribute values (strings)
    .replace(/(&quot;.*?&quot;)/g, '<span class="string">$1</span>')
    // Closing brackets
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
