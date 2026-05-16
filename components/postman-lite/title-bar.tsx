'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { Minus, Square, X, LogOut, User, Users, UserPlus, HelpCircle, Save } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/lib/auth/auth-context'
import { cn } from '@/lib/utils'
import { useMyInvites } from '@/hooks/use-collaboration'

interface TitleBarProps {
  workspaceDropdown?: React.ReactNode
  environments?: React.ReactNode
  activeWorkspace?: { members?: any[] } | null
  isOwner?: boolean
  onOpenMembers?: () => void
  onOpenInvite?: () => void
  onOpenHelp?: () => void
  onSave?: () => void
  canSave?: boolean
}

function Sep() {
  return <div className="w-px h-3.5 bg-border mx-1 shrink-0" />
}

function TitleBtn({
  onClick,
  title,
  disabled,
  children,
  className,
}: {
  onClick?: () => void
  title?: string
  disabled?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={cn(
        'flex items-center gap-1.5 px-2 h-6 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-40 disabled:pointer-events-none text-xs',
        className
      )}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {children}
    </button>
  )
}

export function TitleBar({
  workspaceDropdown,
  environments,
  activeWorkspace,
  isOwner,
  onOpenMembers,
  onOpenInvite,
  onOpenHelp,
  onSave,
  canSave,
}: TitleBarProps) {
  const [isElectron, setIsElectron] = useState(false)
  const { state, logout } = useAuth()
  const { invites } = useMyInvites()

  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI) {
      setIsElectron(true)
    }
  }, [])

  if (!isElectron) return null

  const user = state.status === 'authenticated' ? state.session.user : null
  const memberCount = activeWorkspace?.members?.length ?? 0

  return (
    <div
      className="flex items-center h-8 bg-card border-b border-border select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Logo */}
      <div className="flex items-center gap-1.5 px-3 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <Image src="/logo.png" alt="Quence" width={14} height={14} className="shrink-0" />
        <span className="text-xs font-medium text-muted-foreground">Quence</span>
      </div>

      <Sep />

      {/* Workspace dropdown */}
      {workspaceDropdown && (
        <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {workspaceDropdown}
        </div>
      )}

      <Sep />

      {/* Environment selector */}
      {environments && (
        <>
          <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            {environments}
          </div>
          <Sep />
        </>
      )}

      {/* Draggable spacer */}
      <div className="flex-1" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />

      {/* Right side actions */}
      <div
        className="flex items-center gap-0.5 px-2"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* Members + Invite (owner only) */}
        {isOwner && activeWorkspace && (
          <>
            <TitleBtn onClick={onOpenMembers} title="Manage members">
              <Users className="h-3.5 w-3.5" />
              Members{memberCount > 0 ? ` (${memberCount})` : ''}
            </TitleBtn>
            <TitleBtn onClick={onOpenInvite} title="Invite member">
              <UserPlus className="h-3.5 w-3.5" />
              Invite
            </TitleBtn>
            <Sep />
          </>
        )}

        {/* Help */}
        <TitleBtn onClick={onOpenHelp} title="Help">
          <HelpCircle className="h-3.5 w-3.5" />
          Help
        </TitleBtn>

        {/* Save */}
        <TitleBtn onClick={onSave} disabled={!canSave} title="Save (Ctrl+S)">
          <Save className="h-3.5 w-3.5" />
          Save
        </TitleBtn>

        <Sep />

        {/* Account */}
        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-1.5 px-2 h-6 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors text-xs relative"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                title={user.name}
              >
                <User className="h-3.5 w-3.5 shrink-0" />
                <span className="max-w-24 truncate">{user.name}</span>
                {invites.length > 0 && (
                  <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
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
        ) : (
          <TitleBtn title="Account">
            <User className="h-3.5 w-3.5" />
            Account
          </TitleBtn>
        )}

        <Sep />

        {/* Window controls */}
        <button
          className="flex items-center justify-center h-full w-9 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          onClick={() => window.electronAPI?.minimize()}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          tabIndex={-1}
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          className="flex items-center justify-center h-full w-9 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          onClick={() => window.electronAPI?.maximize()}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          tabIndex={-1}
        >
          <Square className="h-3 w-3" />
        </button>
        <button
          className="flex items-center justify-center h-full w-9 text-muted-foreground hover:bg-[oklch(0.65_0.22_25)] hover:text-white transition-colors"
          onClick={() => window.electronAPI?.close()}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          tabIndex={-1}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
