'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ChevronDown, Check, Plus, Pencil, Trash2, FolderOpen, Download, Upload, MoreHorizontal, LogOut } from 'lucide-react'
import type { Workspace } from '@/lib/db/types'
import { useAuth } from '@/lib/auth/auth-context'
import { leaveWorkspace } from '@/lib/collaboration/store'

interface Props {
  workspaces: Workspace[]
  activeWorkspace: Workspace | null
  onSelect: (id: string) => void
  onCreate: (name: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onExport: (id: string) => void
  onImport: () => void
  onExportAll: () => void
  onImportAll: () => void
  onUpdateWorkspace: (id: string, data: Partial<Workspace>) => Promise<void>
  getWorkspace: (id: string) => Workspace | undefined
  onLeave: (id: string) => void
}

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function WorkspaceAvatar({ name }: { name: string }) {
  return (
    <span className="shrink-0 w-7 h-7 rounded-full bg-primary flex items-center justify-center text-[10px] font-semibold text-primary-foreground select-none">
      {getInitials(name)}
    </span>
  )
}

// Per-row context/actions menu — plain popover to avoid nested Radix DropdownMenu conflicts
function WorkspaceActions({
  owned,
  canDelete,
  onRename,
  onDelete,
  onExport,
  onLeave,
}: {
  owned: boolean
  canDelete: boolean
  onRename: () => void
  onDelete: () => void
  onExport: () => void
  onLeave: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  function act(fn: () => void) {
    setOpen(false)
    fn()
  }

  return (
    <div ref={ref} className="relative shrink-0" data-ws-actions onClick={e => e.stopPropagation()}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        title="Actions"
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-0.5 w-36 bg-popover border border-border rounded-md shadow-lg z-[200] py-1">
          <button onClick={() => act(onExport)} className="flex items-center gap-2 w-full px-2 py-1.5 text-xs hover:bg-accent transition-colors">
            <Download className="h-3.5 w-3.5" /> Export
          </button>
          {owned ? (
            <>
              <button onClick={() => act(onRename)} className="flex items-center gap-2 w-full px-2 py-1.5 text-xs hover:bg-accent transition-colors">
                <Pencil className="h-3.5 w-3.5" /> Rename
              </button>
              {canDelete && (
                <>
                  <div className="my-1 border-t border-border" />
                  <button onClick={() => act(onDelete)} className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-destructive hover:bg-accent transition-colors">
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <div className="my-1 border-t border-border" />
              <button onClick={() => act(onLeave)} className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-destructive hover:bg-accent transition-colors">
                <LogOut className="h-3.5 w-3.5" /> Leave
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export function WorkspaceDropdown({
  workspaces,
  activeWorkspace,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onExport,
  onImport,
  onExportAll,
  onImportAll,
  onUpdateWorkspace,
  getWorkspace,
  onLeave,
}: Props) {
  const { state } = useAuth()
  const currentUserId = state.status === 'authenticated' ? state.session.user.id : null

  const [open, setOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [contextWs, setContextWs] = useState<Workspace | null>(null)
  const [contextPos, setContextPos] = useState({ x: 0, y: 0 })
  const newInputRef = useRef<HTMLInputElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (isCreating) newInputRef.current?.focus() }, [isCreating])
  useEffect(() => { if (renamingId) renameInputRef.current?.focus() }, [renamingId])

  function isOwner(ws: Workspace) {
    return !currentUserId || ws.ownerId === currentUserId || ws.ownerId === 'local'
  }

  const submitCreate = useCallback(() => {
    const name = newName.trim()
    if (name) onCreate(name)
    setNewName('')
    setIsCreating(false)
  }, [newName, onCreate])

  const submitRename = useCallback((id: string) => {
    const name = renameValue.trim()
    if (name) { onRename(id, name); setRenamingId(null) }
  }, [renameValue, onRename])

  const [contextOpen, setContextOpen] = useState(false)

  function handleContextMenu(e: React.MouseEvent, ws: Workspace) {
    e.preventDefault()
    e.stopPropagation()
    setContextOpen(false)
    setContextPos({ x: e.clientX, y: e.clientY })
    setContextWs(ws)
    // defer open so position and ws are set first
    requestAnimationFrame(() => setContextOpen(true))
  }

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-1.5 px-2 h-6 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <FolderOpen className="h-3.5 w-3.5 shrink-0" />
            <span className="text-xs font-medium max-w-32 truncate">
              {activeWorkspace?.name ?? 'Workspaces'}
            </span>
            <ChevronDown className="h-3 w-3 shrink-0" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-72">

          {/* Workspace list */}
          {workspaces.map(ws => {
            const owned = isOwner(ws)
            const isCloud = ws.isSynced || (ws.members?.length ?? 0) > 0
            return (
              <DropdownMenuItem
                key={ws.id}
                onSelect={(e) => {
                  // Don't select/close if the click originated inside the actions popover
                  if ((e.target as HTMLElement).closest('[data-ws-actions]')) {
                    e.preventDefault()
                    return
                  }
                  onSelect(ws.id)
                }}
                className="flex items-center gap-2 group pr-1"
                onContextMenu={e => handleContextMenu(e, ws)}
              >
                {/* Active check */}
                <span className="w-3.5 shrink-0">
                  {ws.id === activeWorkspace?.id && <Check className="h-3.5 w-3.5 text-primary" />}
                </span>

                {/* Name + owner */}
                <div className="flex-1 min-w-0">
                  <span className="block truncate text-sm">{ws.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{owned ? 'Your workspace' : ws.ownerName}</span>
                </div>

                {/* Cloud/Local badge */}
                <span className={`shrink-0 text-[10px] font-semibold tracking-wide px-1.5 py-0.5 rounded uppercase ${
                  isCloud ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                }`}>
                  {isCloud ? 'Cloud' : 'Local'}
                </span>

                {/* Actions ... */}
                <WorkspaceActions
                  owned={owned}
                  canDelete={workspaces.length > 1}
                  onRename={() => { setRenamingId(ws.id); setRenameValue(ws.name); setOpen(false) }}
                  onDelete={() => { onDelete(ws.id); setOpen(false) }}
                  onExport={() => { onExport(ws.id); setOpen(false) }}
                  onLeave={() => { onLeave(ws.id); setOpen(false) }}
                />
              </DropdownMenuItem>
            )
          })}

          <DropdownMenuSeparator />

          {/* New workspace */}
          <DropdownMenuItem onSelect={() => { setIsCreating(true); setOpen(false) }}>
            <Plus className="h-3.5 w-3.5" />
            New Workspace
          </DropdownMenuItem>

          {/* Import/Export */}
          <div className="flex px-1 py-0.5 gap-1">
            <DropdownMenuItem className="flex-1" onSelect={() => { onExport(activeWorkspace?.id ?? ''); setOpen(false) }}>
              <Download className="h-3.5 w-3.5" />
              Export
            </DropdownMenuItem>
            <DropdownMenuItem className="flex-1" onSelect={() => { onImport(); setOpen(false) }}>
              <Upload className="h-3.5 w-3.5" />
              Import
            </DropdownMenuItem>
          </div>
          <DropdownMenuSeparator />
          <div className="flex px-1 py-0.5 gap-1">
            <DropdownMenuItem className="flex-1" onSelect={() => { onExportAll(); setOpen(false) }}>
              <Download className="h-3.5 w-3.5" />
              Export All
            </DropdownMenuItem>
            <DropdownMenuItem className="flex-1" onSelect={() => { onImportAll(); setOpen(false) }}>
              <Upload className="h-3.5 w-3.5" />
              Import All
            </DropdownMenuItem>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Right-click context menu */}
      <DropdownMenu open={contextOpen} onOpenChange={o => { if (!o) { setContextOpen(false); setContextWs(null) } }}>
        <DropdownMenuTrigger asChild>
          <span className="fixed" style={{ left: contextPos.x, top: contextPos.y, width: 0, height: 0, display: contextOpen ? 'block' : 'none' }} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-40">
          {contextWs && (
            <>
              <DropdownMenuItem onSelect={() => { onSelect(contextWs.id); setContextOpen(false); setContextWs(null) }}>
                <Check className="h-3.5 w-3.5" />
                Switch
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => { onExport(contextWs.id); setContextOpen(false); setContextWs(null) }}>
                <Download className="h-3.5 w-3.5" />
                Export
              </DropdownMenuItem>
              {isOwner(contextWs) && (
                <>
                  <DropdownMenuItem onSelect={() => { setRenamingId(contextWs.id); setRenameValue(contextWs.name); setContextOpen(false); setContextWs(null) }}>
                    <Pencil className="h-3.5 w-3.5" />
                    Rename
                  </DropdownMenuItem>
                  {workspaces.length > 1 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => { onDelete(contextWs.id); setContextOpen(false); setContextWs(null) }} className="text-destructive focus:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Rename dialog */}
      <Dialog open={!!renamingId} onOpenChange={o => { if (!o) setRenamingId(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename Workspace</DialogTitle>
          </DialogHeader>
          <Input
            ref={renameInputRef}
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') submitRename(renamingId!)
              if (e.key === 'Escape') setRenamingId(null)
            }}
            placeholder="Workspace name…"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenamingId(null)}>Cancel</Button>
            <Button onClick={() => submitRename(renamingId!)} disabled={!renameValue.trim()}>Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New workspace dialog */}
      <Dialog open={isCreating} onOpenChange={o => { if (!o) { setIsCreating(false); setNewName('') } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New Workspace</DialogTitle>
          </DialogHeader>
          <Input
            ref={newInputRef}
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') submitCreate()
              if (e.key === 'Escape') { setIsCreating(false); setNewName('') }
            }}
            placeholder="Workspace name…"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsCreating(false); setNewName('') }}>Cancel</Button>
            <Button onClick={submitCreate} disabled={!newName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
