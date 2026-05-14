'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { ChevronDown, Check, Plus, Pencil, Trash2, FolderOpen, Download, Upload } from 'lucide-react'
import type { Workspace } from '@/lib/db/types'

interface Props {
  workspaces: Workspace[]
  activeWorkspace: Workspace | null
  onSelect: (id: string) => void
  onCreate: (name: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onExport: (id: string) => void
  onImport: () => void
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
}: Props) {
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const newInputRef = useRef<HTMLInputElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setIsCreating(false)
        setRenamingId(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Focus new-name input when creating
  useEffect(() => {
    if (isCreating) newInputRef.current?.focus()
  }, [isCreating])

  // Focus rename input
  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus()
  }, [renamingId])

  const submitCreate = useCallback(() => {
    const name = newName.trim()
    if (name) {
      onCreate(name)
      setNewName('')
    }
    setIsCreating(false)
  }, [newName, onCreate])

  const submitRename = useCallback((id: string) => {
    const name = renameValue.trim()
    if (name) onRename(id, name)
    setRenamingId(null)
  }, [renameValue, onRename])

  const startRename = useCallback((ws: Workspace, e: React.MouseEvent) => {
    e.stopPropagation()
    setRenamingId(ws.id)
    setRenameValue(ws.name)
  }, [])

  const handleDelete = useCallback((ws: Workspace, e: React.MouseEvent) => {
    e.stopPropagation()
    if (workspaces.length <= 1) return // Can't delete the only workspace
    onDelete(ws.id)
  }, [workspaces.length, onDelete])

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-secondary transition-colors group"
      >
        <FolderOpen className="h-4 w-4 text-primary shrink-0" />
        <span className="text-sm font-medium text-foreground max-w-40 truncate">
          {activeWorkspace?.name ?? 'Workspaces'}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full mt-1 w-64 bg-popover border border-border rounded-lg shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="px-3 py-2 border-b border-border">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Workspaces
            </span>
          </div>

          {/* Workspace list */}
          <div className="max-h-64 overflow-y-auto py-1">
            {workspaces.map(ws => (
              <div
                key={ws.id}
                className={`group flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-accent/20 transition-colors ${
                  ws.id === activeWorkspace?.id ? 'bg-accent/10' : ''
                }`}
                onClick={() => {
                  if (renamingId === ws.id) return
                  onSelect(ws.id)
                  setOpen(false)
                }}
              >
                {/* Checkmark */}
                <span className="w-4 shrink-0">
                  {ws.id === activeWorkspace?.id && (
                    <Check className="h-3.5 w-3.5 text-primary" />
                  )}
                </span>

                {/* Name / rename input */}
                {renamingId === ws.id ? (
                  <input
                    ref={renameInputRef}
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') submitRename(ws.id)
                      if (e.key === 'Escape') setRenamingId(null)
                    }}
                    onBlur={() => submitRename(ws.id)}
                    onClick={e => e.stopPropagation()}
                    className="flex-1 bg-input border border-border rounded px-1.5 py-0.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"
                  />
                ) : (
                  <span className="flex-1 text-sm text-foreground truncate">{ws.name}</span>
                )}

                {/* Actions (visible on hover, hidden while renaming) */}
                {renamingId !== ws.id && (
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={e => { e.stopPropagation(); onExport(ws.id) }}
                      className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                      title="Export workspace"
                    >
                      <Download className="h-3 w-3" />
                    </button>
                    <button
                      onClick={e => startRename(ws, e)}
                      className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                      title="Rename"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={e => handleDelete(ws, e)}
                      disabled={workspaces.length <= 1}
                      className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      title={workspaces.length <= 1 ? "Can't delete the only workspace" : "Delete workspace"}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Create / import workspace */}
          <div className="border-t border-border py-1">
            {isCreating ? (
              <div className="flex items-center gap-2 px-3 py-2">
                <Plus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <input
                  ref={newInputRef}
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') submitCreate()
                    if (e.key === 'Escape') { setIsCreating(false); setNewName('') }
                  }}
                  onBlur={submitCreate}
                  placeholder="Workspace name…"
                  className="flex-1 bg-input border border-border rounded px-1.5 py-0.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
                />
              </div>
            ) : (
              <>
                <button
                  onClick={() => setIsCreating(true)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/20 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New Workspace
                </button>
                <button
                  onClick={() => { setOpen(false); onImport() }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/20 transition-colors"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Import Workspace
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
