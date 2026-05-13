'use client'

import { useState, useEffect } from 'react'
import { Minus, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function TitleBar() {
  const [isElectron, setIsElectron] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI) {
      setIsElectron(true)
    }
  }, [])

  if (!isElectron) {
    return null
  }

  return (
    <div 
      className="flex items-center justify-between h-8 bg-card border-b border-border select-none"
      style={{ WebkitAppRegion: 'drag' } as any}
    >
      <div className="flex items-center px-3">
        <span className="text-xs font-medium text-muted-foreground">Postman Lite</span>
      </div>
      
      <div className="flex items-center h-full" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-full w-10 rounded-none hover:bg-secondary text-muted-foreground hover:text-foreground"
          onClick={() => window.electronAPI?.minimize()}
          tabIndex={-1}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-full w-10 rounded-none hover:bg-secondary text-muted-foreground hover:text-foreground"
          onClick={() => window.electronAPI?.maximize()}
          tabIndex={-1}
        >
          <Square className="h-3.5 w-3.5" />
        </Button>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-full w-10 rounded-none hover:bg-[oklch(0.65_0.22_25)] hover:text-white text-muted-foreground"
          onClick={() => window.electronAPI?.close()}
          tabIndex={-1}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
