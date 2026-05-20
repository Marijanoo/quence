'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { X, Plus, TerminalSquare } from 'lucide-react'
import { generateId } from '@/lib/utils'
import { cn } from '@/lib/utils'
import '@xterm/xterm/css/xterm.css'

interface TermTab {
  id: string
  title: string
  cwd: string
}

function TerminalPane({ id, isVisible }: { id: string; isVisible: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const createdRef = useRef(false)
  // Line buffer for local echo — cmd.exe in piped mode doesn't echo input
  const lineRef = useRef('')

  useEffect(() => {
    if (!containerRef.current || createdRef.current) return
    if (!window.electronAPI?.pty) return
    createdRef.current = true

    const term = new Terminal({
      fontFamily: '"Cascadia Code", "Fira Code", Consolas, monospace',
      fontSize: 12,
      lineHeight: 1.35,
      cursorBlink: true,
      cursorStyle: 'bar',
      convertEol: true,
      disableStdin: false,
      theme: {
        background: '#0f0f0f',
        foreground: '#e4e4e7',
        cursor: '#a1a1aa',
        selectionBackground: '#3f3f46',
        black: '#18181b', red: '#f87171', green: '#4ade80', yellow: '#facc15',
        blue: '#60a5fa', magenta: '#c084fc', cyan: '#22d3ee', white: '#e4e4e7',
        brightBlack: '#52525b', brightRed: '#fca5a5', brightGreen: '#86efac',
        brightYellow: '#fde047', brightBlue: '#93c5fd', brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9', brightWhite: '#f4f4f5',
      },
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon())
    term.open(containerRef.current)
    fit.fit()
    fitRef.current = fit

    window.electronAPI!.pty.create(id, term.cols, term.rows)

    // Shell output → xterm (register listeners before signalling ready)
    window.electronAPI!.pty.onData(id, data => term.write(data))
    window.electronAPI!.pty.onExit(id, () =>
      term.write('\r\n\x1b[90m[process exited]\x1b[0m\r\n')
    )
    // Tell main process listeners are ready — it will now send the initial prompt
    window.electronAPI!.pty.ready(id)

    // Keyboard → shell, with local echo (cmd.exe doesn't echo piped stdin)
    term.onData(data => {
      const code = data.charCodeAt(0)
      if (code === 13) {
        // Enter — send full line via pty:line (Windows) or pty:write (Mac/Linux)
        const line = lineRef.current
        lineRef.current = ''
        term.write('\r\n')
        if (typeof window.electronAPI!.pty.line === 'function') {
          window.electronAPI!.pty.line(id, line)
        } else {
          window.electronAPI!.pty.write(id, line + '\n')
        }
      } else if (code === 127 || code === 8) {
        // Backspace
        if (lineRef.current.length > 0) {
          lineRef.current = lineRef.current.slice(0, -1)
          term.write('\b \b')
        }
      } else if (code === 3) {
        // Ctrl+C
        lineRef.current = ''
        term.write('^C\r\n')
        window.electronAPI!.pty.write(id, '\x03')
      } else if (code >= 32) {
        // Printable
        lineRef.current += data
        term.write(data)
      }
    })

    const ro = new ResizeObserver(() => { try { fit.fit() } catch {} })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      window.electronAPI!.pty.offData(id)
      window.electronAPI!.pty.offExit(id)
      window.electronAPI!.pty.kill(id)
      term.dispose()
      createdRef.current = false
    }
  }, [id])

  useEffect(() => {
    if (!isVisible || !fitRef.current) return
    setTimeout(() => { try { fitRef.current!.fit() } catch {} }, 50)
  }, [isVisible])

  return <div ref={containerRef} className="w-full h-full" style={{ padding: '4px 6px' }} />
}

export function TerminalView({ isActive }: { isActive: boolean }) {
  const [terms, setTerms] = useState<TermTab[]>([])
  const [homedir, setHomedir] = useState('~')
  const counterRef = useRef(1)

  useEffect(() => {
    if (!window.electronAPI?.pty) return
    window.electronAPI.pty.homedir().then(h => {
      setHomedir(h)
      const id = generateId()
      setTerms([{ id, title: `Terminal ${counterRef.current++}`, cwd: h }])
    })
  }, [])

  const addTerm = useCallback(() => {
    const id = generateId()
    setTerms(prev => [...prev, { id, title: `Terminal ${counterRef.current++}`, cwd: homedir }])
  }, [homedir])

  const closeTerm = useCallback((id: string) => {
    setTerms(prev => prev.filter(t => t.id !== id))
  }, [])

  // Grid: 1 col up to 1 terminal, 2 cols for 2+, max 2 per row
  const colClass = terms.length === 1 ? 'grid-cols-1' : 'grid-cols-2'

  return (
    <div className="flex flex-col w-full h-full bg-background overflow-hidden">
      <div className={cn('grid gap-3 p-3 flex-1 min-h-0 overflow-auto', colClass)}>
        {terms.map(term => (
          <div
            key={term.id}
            className="flex flex-col rounded-lg border border-border overflow-hidden min-h-0"
            style={{ minHeight: 220 }}
          >
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-card border-b border-border shrink-0">
              <TerminalSquare className="h-3.5 w-3.5 text-green-400 shrink-0" />
              <span className="text-xs font-medium text-foreground truncate">{term.title}</span>
              <span className="text-xs text-muted-foreground truncate flex-1">{term.cwd}</span>
              <button
                onClick={() => closeTerm(term.id)}
                className="text-muted-foreground hover:text-red-400 transition-colors shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Terminal body */}
            <div className="flex-1 min-h-0" style={{ background: '#0f0f0f' }}>
              <TerminalPane id={term.id} isVisible={isActive} />
            </div>
          </div>
        ))}

        {/* Add terminal card */}
        <button
          onClick={addTerm}
          className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border hover:border-primary/50 hover:bg-accent/10 transition-colors text-muted-foreground hover:text-foreground group"
          style={{ minHeight: 220 }}
        >
          <div className="flex items-center justify-center h-12 w-12 rounded-full border-2 border-dashed border-current group-hover:border-primary/50 transition-colors">
            <Plus className="h-6 w-6" />
          </div>
          <span className="text-xs">New Terminal</span>
        </button>
      </div>
    </div>
  )
}
