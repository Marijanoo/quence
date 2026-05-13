'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import type { EnvironmentVariable } from '@/lib/db/types'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Check, X } from 'lucide-react'

interface VariableHighlightInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  variables: EnvironmentVariable[]
  onUpdateVariable?: (key: string, value: string) => void
}

const VARIABLE_PATTERN = /\{\{([^}]+)\}\}/g

interface VariableMatch {
  fullMatch: string
  variableName: string
  start: number
  end: number
}

function extractVariableMatches(text: string): VariableMatch[] {
  const matches: VariableMatch[] = []
  let match

  while ((match = VARIABLE_PATTERN.exec(text)) !== null) {
    matches.push({
      fullMatch: match[0],
      variableName: match[1].trim(),
      start: match.index,
      end: match.index + match[0].length,
    })
  }

  VARIABLE_PATTERN.lastIndex = 0
  return matches
}

interface VariableTagProps {
  variableName: string
  fullMatch: string
  variables: EnvironmentVariable[]
  onUpdateVariable?: (key: string, value: string) => void
}

function VariableTag({ variableName, fullMatch, variables, onUpdateVariable }: VariableTagProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null)

  const variable = variables.find((v) => v.key === variableName && v.enabled)
  const isResolved = !!variable
  const currentValue = variable?.value || ''

  useEffect(() => {
    if (isOpen) {
      setEditValue(currentValue)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [isOpen, currentValue])

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    }
  }, [])

  const handleMouseEnter = () => {
    if (isOpen) return
    hoverTimerRef.current = setTimeout(() => {
      setIsOpen(true)
    }, 500)
  }

  const handleMouseLeave = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
  }

  const handleSave = () => {
    if (onUpdateVariable) {
      onUpdateVariable(variableName, editValue)
    }
    setIsOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave()
    } else if (e.key === 'Escape') {
      setIsOpen(false)
    }
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <span
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'inline-flex items-center px-1 py-0.5 rounded text-sm font-mono cursor-pointer transition-colors mx-0.5',
            isResolved
              ? 'bg-[oklch(0.45_0.15_160)] text-[oklch(0.9_0.1_160)] hover:bg-[oklch(0.5_0.15_160)]'
              : 'bg-[oklch(0.45_0.18_30)] text-[oklch(0.9_0.1_30)] hover:bg-[oklch(0.5_0.18_30)]'
          )}
          title={isResolved ? `${variableName} = ${currentValue}` : `${variableName} (unresolved)`}
        >
          {fullMatch}
        </span>
      </PopoverTrigger>
      <PopoverContent 
        className="w-72 p-3" 
        align="start"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">{variableName}</span>
            <span
              className={cn(
                'text-xs px-1.5 py-0.5 rounded',
                isResolved
                  ? 'bg-[oklch(0.35_0.12_160)] text-[oklch(0.85_0.1_160)]'
                  : 'bg-[oklch(0.35_0.15_30)] text-[oklch(0.85_0.1_30)]'
              )}
            >
              {isResolved ? 'Resolved' : 'Unresolved'}
            </span>
          </div>

          {isResolved && (
            <div className="text-xs text-muted-foreground">
              Current: <span className="font-mono text-foreground">{currentValue}</span>
            </div>
          )}

          {onUpdateVariable && (
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">
                {isResolved ? 'Update value:' : 'Set value:'}
              </label>
              <div className="flex items-center gap-2">
                <Input
                  ref={inputRef}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter value"
                  className="h-8 text-sm font-mono flex-1"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-[oklch(0.7_0.15_160)] hover:text-[oklch(0.8_0.15_160)]"
                  onClick={handleSave}
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => setIsOpen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {!onUpdateVariable && !isResolved && (
            <div className="text-xs text-muted-foreground">
              Add this variable to an environment to resolve it.
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function VariableHighlightInput({
  value,
  onChange,
  placeholder,
  className,
  variables,
  onUpdateVariable,
}: VariableHighlightInputProps) {
  const [isFocused, setIsFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  // Sync scroll position between input and overlay
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

  const variableMatches = extractVariableMatches(value)

  // Build highlighted segments
  const renderHighlightedContent = () => {
    if (variableMatches.length === 0) {
      return <span className="whitespace-pre">{value || placeholder}</span>
    }

    const segments: React.ReactNode[] = []
    let lastIndex = 0

    variableMatches.forEach((match, idx) => {
      // Text before the variable
      if (match.start > lastIndex) {
        segments.push(
          <span key={`text-${idx}`} className="whitespace-pre">
            {value.slice(lastIndex, match.start)}
          </span>
        )
      }

      // The variable tag
      segments.push(
        <VariableTag
          key={`var-${idx}`}
          variableName={match.variableName}
          fullMatch={match.fullMatch}
          variables={variables}
          onUpdateVariable={onUpdateVariable}
        />
      )

      lastIndex = match.end
    })

    // Text after the last variable
    if (lastIndex < value.length) {
      segments.push(
        <span key="text-end" className="whitespace-pre">
          {value.slice(lastIndex)}
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
    const pairs: Record<string, string> = {
      '{': '}',
      '[': ']',
      '(': ')',
      '"': '"',
      "'": "'",
    }

    // Auto-close pairs
    if (pairs[char] && selectionStart !== null && selectionEnd !== null) {
      e.preventDefault()
      const closeChar = pairs[char]
      const newValue = value.slice(0, selectionStart) + char + closeChar + value.slice(selectionEnd)
      onChange(newValue)
      
      // Move cursor after the opening char
      setTimeout(() => {
        input.selectionStart = input.selectionEnd = selectionStart + 1
      }, 0)
      return
    }

    // Overtrying closing char
    const closingChars = Object.values(pairs)
    if (closingChars.includes(char) && selectionStart === selectionEnd && selectionStart !== null && value[selectionStart] === char) {
      e.preventDefault()
      input.selectionStart = input.selectionEnd = selectionStart + 1
      return
    }

    // Handle Backspace for empty pairs
    if (e.key === 'Backspace' && selectionStart === selectionEnd && selectionStart !== null && selectionStart > 0) {
      const charBefore = value[selectionStart - 1]
      const charAfter = value[selectionStart]
      if (pairs[charBefore] === charAfter) {
        e.preventDefault()
        const newValue = value.slice(0, selectionStart - 1) + value.slice(selectionStart + 1)
        onChange(newValue)
        setTimeout(() => {
          input.selectionStart = input.selectionEnd = selectionStart - 1
        }, 0)
        return
      }
    }
  }

  return (
    <div className="relative">
      {/* Interactive overlay for highlighted variables - only shown when not focused */}
      {!isFocused && variableMatches.length > 0 && (
        <div
          ref={overlayRef}
          className={cn(
            'absolute inset-0 flex items-center px-3 overflow-hidden',
            className
          )}
          style={{ zIndex: 1 }}
          onClick={(e) => {
            // Only focus input if clicking outside of a variable tag
            if ((e.target as HTMLElement).tagName !== 'SPAN' && !(e.target as HTMLElement).closest('span.cursor-pointer')) {
              inputRef.current?.focus()
            }
          }}
        >
          <div className="flex items-center whitespace-nowrap font-mono text-sm">
            {renderHighlightedContent()}
          </div>
        </div>
      )}

      {/* Actual input */}
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={cn(
          'font-mono text-sm',
          !isFocused && variableMatches.length > 0 && 'text-transparent caret-foreground',
          className
        )}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
      />
    </div>
  )
}
