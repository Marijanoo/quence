'use client'

import { useRef, useEffect } from 'react'
import { X, ChevronUp, ChevronDown } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface SearchBarProps {
  query: string
  onQueryChange: (q: string) => void
  matchCount: number
  currentMatch: number
  onNext: () => void
  onPrev: () => void
  onClose: () => void
}

export function SearchBar({ query, onQueryChange, matchCount, currentMatch, onNext, onPrev, onClose }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'Enter') { e.shiftKey ? onPrev() : onNext(); return }
    if (e.key === 'F3') { e.preventDefault(); e.shiftKey ? onPrev() : onNext() }
  }

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border bg-[oklch(0.18_0.01_260)]"
      onKeyDown={handleKeyDown}
    >
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Search..."
        className="h-7 text-xs font-mono w-48 bg-[oklch(0.22_0.01_260)] border-border focus-visible:ring-1"
      />
      <span className="text-xs text-muted-foreground min-w-[60px]">
        {matchCount === 0 ? (query ? 'No results' : '') : `${currentMatch + 1} / ${matchCount}`}
      </span>
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onPrev} disabled={matchCount === 0} title="Previous (Shift+Enter)">
        <ChevronUp className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onNext} disabled={matchCount === 0} title="Next (Enter)">
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose} title="Close (Esc)">
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
