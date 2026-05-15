'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useDebouncedCallback } from '@/hooks/use-debounce'
import type { EnvironmentVariable } from '@/lib/db/types'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Check, X } from 'lucide-react'

interface VariableHighlightInputProps {
  value: string
  onChange: (value: string) => void
  onPaste?: (e: React.ClipboardEvent<HTMLInputElement>) => void
  onEnter?: () => void
  placeholder?: string
  className?: string
  variables: EnvironmentVariable[]
  onUpdateVariable?: (key: string, value: string) => void
  disabled?: boolean
  readOnly?: boolean
}

interface VariableMatch {
  fullMatch: string
  variableName: string
  start: number
  end: number
}

function extractVariableMatches(text: string): VariableMatch[] {
  const pattern = /\{\{([^}]+)\}\}/g
  const matches: VariableMatch[] = []
  let match
  while ((match = pattern.exec(text)) !== null) {
    matches.push({
      fullMatch: match[0],
      variableName: match[1].trim(),
      start: match.index,
      end: match.index + match[0].length,
    })
  }
  return matches
}

export function VariableHighlightInput({
  value,
  onChange,
  onPaste,
  onEnter,
  placeholder,
  className,
  variables,
  onUpdateVariable,
  disabled,
  readOnly,
}: VariableHighlightInputProps) {
  const [isFocused, setIsFocused] = useState(false)
  const [popoverMatch, setPopoverMatch] = useState<VariableMatch | null>(null)
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number } | null>(null)
  const [localValue, setLocalValue] = useState(value)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null)
  const closeTimerRef = useRef<NodeJS.Timeout | null>(null)
  const editInputRef = useRef<HTMLInputElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Sync with prop value (e.g. when switching tabs)
  useEffect(() => {
    setLocalValue(value)
  }, [value])

  const debouncedOnChange = useDebouncedCallback(onChange, 300)

  const handleChange = (newValue: string, immediate = false) => {
    setLocalValue(newValue)
    if (immediate) {
      debouncedOnChange(newValue) // This will clear pending
      onChange(newValue)
    } else {
      debouncedOnChange(newValue)
    }
  }

  const syncScroll = useCallback(() => {
    if (inputRef.current && overlayRef.current) {
      overlayRef.current.scrollLeft = inputRef.current.scrollLeft
    }
  }, [])

  useEffect(() => {
    const input = inputRef.current
    if (input) {
      input.addEventListener('scroll', syncScroll)
      return () => input.removeEventListener('scroll', syncScroll)
    }
  }, [syncScroll])

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    }
  }, [])

  const scheduleClose = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    closeTimerRef.current = setTimeout(() => {
      setPopoverMatch(null)
      setPopoverPos(null)
    }, 150)
  }, [])

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (popoverMatch) {
      const variable = variables.find(v => v.key === popoverMatch.variableName && v.enabled)
      setEditValue(variable?.value || '')
      setTimeout(() => editInputRef.current?.focus(), 0)
    }
  }, [popoverMatch])

  // Close popover on outside click
  useEffect(() => {
    if (!popoverMatch) return
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverMatch(null)
        setPopoverPos(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [popoverMatch])

  const variableMatches = extractVariableMatches(localValue)

  const getMatchAtClientX = useCallback((clientX: number): VariableMatch | null => {
    const overlay = overlayRef.current
    if (!overlay) return null
    const spans = overlay.querySelectorAll<HTMLSpanElement>('span[data-var-idx]')
    for (const span of spans) {
      const rect = span.getBoundingClientRect()
      if (clientX >= rect.left && clientX <= rect.right) {
        const idx = parseInt(span.dataset.varIdx || '-1', 10)
        return variableMatches[idx] ?? null
      }
    }
    return null
  }, [variableMatches])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLInputElement>) => {
    const match = getMatchAtClientX(e.clientX)

    if (popoverMatch) {
      // Popover is open — cancel close if hovering over the same tag
      if (match?.variableName === popoverMatch.variableName) {
        cancelClose()
      } else {
        scheduleClose()
      }
      return
    }

    const currentTimer = hoverTimerRef.current
    if (match) {
      cancelClose()
      if (!currentTimer) {
        const capturedX = e.clientX
        const capturedY = e.clientY
        hoverTimerRef.current = setTimeout(() => {
          hoverTimerRef.current = null
          setPopoverPos({ x: capturedX, y: capturedY })
          setPopoverMatch(match)
        }, 500)
      }
    } else {
      if (currentTimer) {
        clearTimeout(currentTimer)
        hoverTimerRef.current = null
      }
    }
  }, [popoverMatch, getMatchAtClientX, cancelClose, scheduleClose])

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
    if (popoverMatch) scheduleClose()
  }, [popoverMatch, scheduleClose])

  const handleSave = () => {
    if (onUpdateVariable && popoverMatch) {
      onUpdateVariable(popoverMatch.variableName, editValue)
    }
    setPopoverMatch(null)
    setPopoverPos(null)
  }

  const handlePopoverKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave()
    else if (e.key === 'Escape') { setPopoverMatch(null); setPopoverPos(null) }
  }

  const renderHighlightedContent = () => {
    if (variableMatches.length === 0) return null

    const segments: React.ReactNode[] = []
    let lastIndex = 0

    variableMatches.forEach((match, idx) => {
      if (match.start > lastIndex) {
        segments.push(
          <span key={`text-${idx}`} className="whitespace-pre text-foreground select-none">
            {localValue.slice(lastIndex, match.start)}
          </span>
        )
      }

      const isResolved = variables.some(v => v.key === match.variableName && v.enabled)
      segments.push(
        <span
          key={`var-${idx}`}
          data-var-idx={idx}
          className={cn(
            'font-mono text-sm select-none',
            isResolved
              ? 'bg-[oklch(0.35_0.12_160)] text-[oklch(0.85_0.15_160)]'
              : 'bg-[oklch(0.35_0.15_30)] text-[oklch(0.85_0.12_30)]'
          )}
        >
          {match.fullMatch}
        </span>
      )

      lastIndex = match.end
    })

    if (lastIndex < value.length) {
      segments.push(
        <span key="text-end" className="whitespace-pre text-foreground select-none">
          {localValue.slice(lastIndex)}
        </span>
      )
    }

    return segments
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const input = inputRef.current
    if (!input) return

    const { selectionStart, selectionEnd } = input
    const char = e.key
    const pairs: Record<string, string> = { '{': '}', '[': ']', '(': ')', '"': '"', "'": "'" }

    if (pairs[char] && selectionStart !== null && selectionEnd !== null) {
      e.preventDefault()
      const newValue = localValue.slice(0, selectionStart) + char + pairs[char] + localValue.slice(selectionEnd)
      handleChange(newValue, true)
      setTimeout(() => { input.selectionStart = input.selectionEnd = selectionStart + 1 }, 0)
      return
    }

    const closingChars = Object.values(pairs)
    if (closingChars.includes(char) && selectionStart === selectionEnd && selectionStart !== null && localValue[selectionStart] === char) {
      e.preventDefault()
      input.selectionStart = input.selectionEnd = selectionStart + 1
      return
    }

    if (e.key === 'Backspace' && selectionStart === selectionEnd && selectionStart !== null && selectionStart > 0) {
      const charBefore = localValue[selectionStart - 1]
      const charAfter = localValue[selectionStart]
      if (pairs[charBefore] === charAfter) {
        e.preventDefault()
        const newValue = localValue.slice(0, selectionStart - 1) + localValue.slice(selectionStart + 1)
        handleChange(newValue, true)
        setTimeout(() => { input.selectionStart = input.selectionEnd = selectionStart - 1 }, 0)
        return
      }
    }

    if (e.key === 'Enter') {
      handleChange(localValue, true)
      onEnter?.()
    }
  }

  const activeVariable = popoverMatch ? variables.find(v => v.key === popoverMatch.variableName && v.enabled) : null
  const isResolved = !!activeVariable

  return (
    <div className="relative">
      {/* Highlight overlay — on top visually, but pointer-events-none so input handles all events */}
      {variableMatches.length > 0 && (
        <div
          ref={overlayRef}
          className="absolute inset-px flex items-center px-3 overflow-hidden pointer-events-none"
          style={{ zIndex: 3 }}
        >
          <div className="flex items-center whitespace-nowrap font-mono text-sm">
            {renderHighlightedContent()}
          </div>
        </div>
      )}

      {/* Actual input — transparent text so overlay shows through */}
      <Input
        ref={inputRef}
        value={localValue}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onMouseMove={variableMatches.length > 0 ? handleMouseMove : undefined}
        onMouseLeave={variableMatches.length > 0 ? handleMouseLeave : undefined}
        placeholder={placeholder}
        className={cn(
          'font-mono text-sm',
          variableMatches.length > 0 && 'text-transparent caret-foreground selection:bg-primary/30 bg-transparent',
          className
        )}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        disabled={disabled}
        readOnly={readOnly}
        style={variableMatches.length > 0 ? { caretColor: 'var(--foreground)', position: 'relative', zIndex: 4, background: 'transparent' } : undefined}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          setIsFocused(false)
          if (localValue !== value) handleChange(localValue, true)
        }}
        onPaste={onPaste}
      />

      {/* Hover popover */}
      {popoverMatch && popoverPos && (
        <div
          ref={popoverRef}
          className="fixed z-50 w-72 rounded-md border border-border bg-popover p-3 shadow-md"
          style={{ left: popoverPos.x, top: popoverPos.y + 24 }}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">{popoverMatch.variableName}</span>
              <span className={cn('text-xs px-1.5 py-0.5 rounded', isResolved ? 'bg-[oklch(0.35_0.12_160)] text-[oklch(0.85_0.1_160)]' : 'bg-[oklch(0.35_0.15_30)] text-[oklch(0.85_0.1_30)]')}>
                {isResolved ? 'Resolved' : 'Unresolved'}
              </span>
            </div>
            {isResolved && (
              <div className="text-xs text-muted-foreground">
                Current: <span className="font-mono text-foreground truncate max-w-[180px] inline-block align-bottom" title={activeVariable.value}>{activeVariable.value}</span>
              </div>
            )}
            {onUpdateVariable && (
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">{isResolved ? 'Update value:' : 'Set value:'}</label>
                <div className="flex items-center gap-2">
                  <Input
                    ref={editInputRef}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={handlePopoverKeyDown}
                    placeholder="Enter value"
                    className="h-8 text-sm font-mono flex-1"
                  />
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-[oklch(0.7_0.15_160)] hover:text-[oklch(0.8_0.15_160)]" onClick={handleSave}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => { setPopoverMatch(null); setPopoverPos(null) }}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
            {!onUpdateVariable && !isResolved && (
              <div className="text-xs text-muted-foreground">Add this variable to an environment to resolve it.</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
