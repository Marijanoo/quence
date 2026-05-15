'use client'

import { useState, useEffect } from 'react'
import { Minus, Square, X, LogOut, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/lib/auth/auth-context'

export function TitleBar() {
  const [isElectron, setIsElectron] = useState(false)
  const { state, logout } = useAuth()

  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI) {
      setIsElectron(true)
    }
  }, [])

  if (!isElectron) {
    return null
  }

  const user = state.status === 'authenticated' ? state.session.user : null

  return (
    <div
      className="flex items-center justify-between h-8 bg-card border-b border-border select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="flex items-center gap-2 px-3" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <span className="text-xs font-medium text-muted-foreground" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
          Postman Lite
        </span>

        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-1 rounded">
                <span className="max-w-[140px] truncate">{user.name}</span>
                <ChevronDown className="h-3 w-3 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <div className="px-2 py-1.5 space-y-0.5">
                <p className="text-sm font-medium truncate">{user.name}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
                <LogOut className="h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="flex items-center h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
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
