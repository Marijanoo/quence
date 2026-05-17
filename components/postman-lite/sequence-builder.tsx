'use client'

import { useState, useRef, useCallback } from 'react'
import type { Sequence, SequenceStep, SequenceStepResult, SequenceAction, RequestConfig } from '@/lib/db/types'
import { generateId } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ResponseViewer } from './response-viewer'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Play, Plus, Trash2, GripVertical, X, FileJson, Square, Zap, ChevronRight, MoreHorizontal, Pencil, ListOrdered, ArrowLeft } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { VariableHighlightInput } from './variable-highlight-input'
import { useEnvironmentContext } from './environment-context'

const methodColors: Record<string, string> = {
  GET: 'text-[oklch(0.88_0.15_140)]',
  POST: 'text-[oklch(0.88_0.14_75)]',
  PUT: 'text-[oklch(0.88_0.13_240)]',
  PATCH: 'text-[oklch(0.88_0.13_300)]',
  DELETE: 'text-[oklch(0.88_0.14_15)]',
  HEAD: 'text-[oklch(0.88_0.11_195)]',
  OPTIONS: 'text-muted-foreground',
}

function StatusBadge({ result }: { result?: SequenceStepResult }) {
  if (!result || result.status === 'idle') return null
  if (result.status === 'running') {
    return <span className="text-[10px] font-mono font-semibold text-[oklch(0.75_0.18_80)] animate-pulse">…</span>
  }
  if (result.status === 'skipped') {
    return <span className="text-[10px] font-mono font-semibold text-muted-foreground">SKIP</span>
  }
  if (result.status === 'error' && !result.statusCode) {
    return <span className="text-[10px] font-mono font-semibold text-[oklch(0.65_0.22_25)]">ERR</span>
  }
  if (result.extractedValue !== undefined) {
    return (
      <span className="text-[10px] font-mono font-semibold text-[oklch(0.72_0.19_160)] max-w-[80px] truncate" title={result.extractedValue}>
        ={result.extractedValue}
      </span>
    )
  }
  const color = result.status === 'success'
    ? 'text-[oklch(0.72_0.19_160)]'
    : result.statusCode && result.statusCode >= 400
      ? 'text-[oklch(0.65_0.22_25)]'
      : 'text-[oklch(0.75_0.18_80)]'
  return <span className={cn('text-[10px] font-mono font-semibold', color)}>{result.statusCode}</span>
}

function subSeqStats(subResults: Record<string, SequenceStepResult>): { lastCode: number | null; total: number | null } {
  let lastCode: number | null = null
  let total = 0; let hasAny = false
  for (const r of Object.values(subResults)) {
    if (!r || r.status === 'idle' || r.status === 'running') continue
    if (r.statusCode !== undefined) lastCode = r.statusCode
    if (r.duration !== undefined) { total += r.duration; hasAny = true }
    // Recurse into nested sub-sequences
    if (r.subResults) {
      const nested = subSeqStats(r.subResults)
      if (nested.lastCode !== null) lastCode = nested.lastCode
      if (nested.total !== null) { total += nested.total; hasAny = true }
    }
  }
  return { lastCode, total: hasAny ? total : null }
}

// Returns true if adding candidateId as a step of targetId would create a cycle.
function wouldCreateCycle(sequences: Sequence[], targetId: string, candidateId: string): boolean {
  if (candidateId === targetId) return true
  const visited = new Set<string>()
  const dfs = (id: string): boolean => {
    if (visited.has(id)) return false
    visited.add(id)
    const seq = sequences.find(s => s.id === id)
    if (!seq) return false
    return seq.steps.some(step => step.type === 'sequence' && step.sequenceId && dfs(step.sequenceId))
  }
  // Start DFS from candidateId — if it ever reaches targetId, adding candidate to target makes a cycle
  const visitedCheck = new Set<string>([targetId])
  const reaches = (id: string): boolean => {
    if (visitedCheck.has(id)) return id === targetId
    visitedCheck.add(id)
    const seq = sequences.find(s => s.id === id)
    if (!seq) return false
    return seq.steps.some(step => step.type === 'sequence' && step.sequenceId && (step.sequenceId === targetId || reaches(step.sequenceId)))
  }
  return candidateId === targetId || reaches(candidateId)
}

interface SequenceBuilderProps {
  sequences: Sequence[]
  workspaceId?: string | null
  onCreateSequence: (seq: Sequence) => void
  onUpdateSequence: (id: string, data: Partial<Sequence>) => void
  onDeleteSequence: (id: string) => void
  onRunSequence: (seq: Sequence) => void
  onStopSequence: () => void
  runningSequenceId: string | null
  stepResults: Record<string, SequenceStepResult>
}

export function SequenceBuilder({
  sequences,
  workspaceId,
  onCreateSequence,
  onUpdateSequence,
  onDeleteSequence,
  onRunSequence,
  onStopSequence,
  runningSequenceId,
  stepResults,
}: SequenceBuilderProps) {
  const { variables, updateVariable } = useEnvironmentContext()
  const [activeSequenceId, setActiveSequenceId] = useState<string | null>(sequences[0]?.id ?? null)
  const [newName, setNewName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const [dragStepIdx, setDragStepIdx] = useState<number | null>(null)
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)

  const activeSequence = sequences.find(s => s.id === activeSequenceId) ?? null
  const isRunning = runningSequenceId === activeSequenceId

  // Last response code and total duration across all completed steps (recursive for sub-sequences)
  const { lastStatusCode, totalDuration } = (() => {
    if (!activeSequence) return { lastStatusCode: null, totalDuration: null }
    let last: number | null = null
    let total = 0
    let hasAny = false
    for (const step of activeSequence.steps) {
      const r = stepResults[step.id]
      if (!r || r.status === 'idle' || r.status === 'running') continue
      if (step.type === 'sequence' && r.subResults) {
        const { lastCode, total: subTotal } = subSeqStats(r.subResults)
        if (lastCode !== null) last = lastCode
        if (subTotal !== null) { total += subTotal; hasAny = true }
      } else {
        if (r.statusCode !== undefined) last = r.statusCode
        if (r.duration !== undefined) { total += r.duration; hasAny = true }
      }
    }
    return { lastStatusCode: last, totalDuration: hasAny ? total : null }
  })()

  const handleCreate = () => {
    if (!newName.trim()) return
    const seq: Sequence = {
      id: generateId(),
      name: newName.trim(),
      workspaceId: workspaceId ?? undefined,
      steps: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    onCreateSequence(seq)
    setActiveSequenceId(seq.id)
    setNewName('')
    setIsCreating(false)
  }

  const addRequest = useCallback((req: RequestConfig) => {
    if (!activeSequence) return
    const step: SequenceStep = {
      id: generateId(),
      type: 'request',
      requestId: req.id,
      name: req.name,
      method: req.method,
      url: req.url,
      order: activeSequence.steps.length,
    }
    onUpdateSequence(activeSequence.id, { steps: [...activeSequence.steps, step] })
  }, [activeSequence, onUpdateSequence])

  const addAction = useCallback((action: SequenceAction) => {
    if (!activeSequence) return
    const step: SequenceStep = {
      id: generateId(),
      type: 'action',
      name: 'Extract JSON',
      action,
      order: activeSequence.steps.length,
    }
    onUpdateSequence(activeSequence.id, { steps: [...activeSequence.steps, step] })
  }, [activeSequence, onUpdateSequence])

  const updateActionStep = (stepId: string, patch: Partial<SequenceAction>) => {
    if (!activeSequence) return
    const steps = activeSequence.steps.map(s =>
      s.id === stepId && s.action
        ? { ...s, action: { ...s.action, ...patch } }
        : s
    )
    onUpdateSequence(activeSequence.id, { steps })
  }

  const removeStep = (stepId: string) => {
    if (!activeSequence) return
    onUpdateSequence(activeSequence.id, {
      steps: activeSequence.steps.filter(s => s.id !== stepId).map((s, i) => ({ ...s, order: i })),
    })
  }

  // ── Step drag-and-drop ───────────────────────────────────────────────────

  const handleStepDragStart = (e: React.DragEvent, idx: number) => {
    setDragStepIdx(idx)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleStepDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIdx(idx)
  }

  const handleStepDrop = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault()

    const rawRequest = e.dataTransfer.getData('application/sequence-request')
    if (rawRequest) {
      try {
        const req: RequestConfig = JSON.parse(rawRequest)
        if (!activeSequence) return
        const step: SequenceStep = {
          id: generateId(), type: 'request', requestId: req.id, name: req.name,
          method: req.method, url: req.url, order: targetIdx,
        }
        const steps = [...activeSequence.steps]
        steps.splice(targetIdx, 0, step)
        onUpdateSequence(activeSequence.id, { steps: steps.map((s, i) => ({ ...s, order: i })) })
      } catch { /* ignore */ }
      setDragOverIdx(null); setDragStepIdx(null)
      return
    }

    const rawAction = e.dataTransfer.getData('application/sequence-action')
    if (rawAction) {
      try {
        const action: SequenceAction = JSON.parse(rawAction)
        if (!activeSequence) return
        const step: SequenceStep = {
          id: generateId(), type: 'action', name: 'Extract JSON', action, order: targetIdx,
        }
        const steps = [...activeSequence.steps]
        steps.splice(targetIdx, 0, step)
        onUpdateSequence(activeSequence.id, { steps: steps.map((s, i) => ({ ...s, order: i })) })
      } catch { /* ignore */ }
      setDragOverIdx(null); setDragStepIdx(null)
      return
    }

    const rawSeq = e.dataTransfer.getData('application/sequence-step')
    if (rawSeq) {
      try {
        const dragged: Sequence = JSON.parse(rawSeq)
        if (!activeSequence) return
        if (wouldCreateCycle(sequences, activeSequence.id, dragged.id)) return
        const step: SequenceStep = {
          id: generateId(), type: 'sequence', sequenceId: dragged.id, name: dragged.name, order: targetIdx,
        }
        const steps = [...activeSequence.steps]
        steps.splice(targetIdx, 0, step)
        onUpdateSequence(activeSequence.id, { steps: steps.map((s, i) => ({ ...s, order: i })) })
      } catch { /* ignore */ }
      setDragOverIdx(null); setDragStepIdx(null)
      return
    }

    if (dragStepIdx === null || dragStepIdx === targetIdx || !activeSequence) {
      setDragOverIdx(null); setDragStepIdx(null)
      return
    }
    const steps = [...activeSequence.steps]
    const [moved] = steps.splice(dragStepIdx, 1)
    steps.splice(targetIdx, 0, moved)
    onUpdateSequence(activeSequence.id, { steps: steps.map((s, i) => ({ ...s, order: i })) })
    setDragOverIdx(null); setDragStepIdx(null)
  }

  const handleListDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (dragOverIdx !== null) return

    const rawRequest = e.dataTransfer.getData('application/sequence-request')
    if (rawRequest && activeSequence) {
      try {
        const req: RequestConfig = JSON.parse(rawRequest)
        addRequest(req)
      } catch { /* ignore */ }
      return
    }

    const rawAction = e.dataTransfer.getData('application/sequence-action')
    if (rawAction && activeSequence) {
      try {
        const action: SequenceAction = JSON.parse(rawAction)
        addAction(action)
      } catch { /* ignore */ }
      return
    }

    const rawSeq = e.dataTransfer.getData('application/sequence-step')
    if (rawSeq && activeSequence) {
      try {
        const dragged: Sequence = JSON.parse(rawSeq)
        if (wouldCreateCycle(sequences, activeSequence.id, dragged.id)) return
        const step: SequenceStep = {
          id: generateId(), type: 'sequence', sequenceId: dragged.id, name: dragged.name,
          order: activeSequence.steps.length,
        }
        onUpdateSequence(activeSequence.id, { steps: [...activeSequence.steps, step] })
      } catch { /* ignore */ }
    }
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Left panel: sequences list + actions palette */}
      <div className="w-52 shrink-0 flex flex-col border-r border-border">
        {/* Sequences section */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
          <span className="text-xs font-medium text-foreground">Sequences</span>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsCreating(true)}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex-1 overflow-auto py-1 min-h-0">
          {sequences.map(seq => (
            <div
              key={seq.id}
              className={cn(
                'group flex items-center px-3 py-1.5 cursor-pointer hover:bg-secondary/50',
                activeSequenceId === seq.id && 'bg-secondary',
              )}
              onClick={() => { if (renamingId !== seq.id) setActiveSequenceId(seq.id) }}
              onContextMenu={(e) => { e.preventDefault(); setOpenMenuId(seq.id) }}
            >
              {renamingId === seq.id ? (
                <Input
                  autoFocus
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      if (renameValue.trim()) onUpdateSequence(seq.id, { name: renameValue.trim() })
                      setRenamingId(null)
                    }
                    if (e.key === 'Escape') setRenamingId(null)
                  }}
                  onBlur={() => {
                    if (renameValue.trim()) onUpdateSequence(seq.id, { name: renameValue.trim() })
                    setRenamingId(null)
                  }}
                  onClick={e => e.stopPropagation()}
                  className="h-6 text-xs flex-1 px-1"
                />
              ) : (
                <>
                  <span className="flex-1 text-xs truncate">{seq.name}</span>
                  <DropdownMenu open={openMenuId === seq.id} onOpenChange={(o) => setOpenMenuId(o ? seq.id : null)}>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0" onClick={e => e.stopPropagation()}>
                        <MoreHorizontal className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={e => { e.stopPropagation(); setRenamingId(seq.id); setRenameValue(seq.name) }}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={e => {
                          e.stopPropagation()
                          if (activeSequenceId === seq.id) setActiveSequenceId(sequences.find(s => s.id !== seq.id)?.id ?? null)
                          onDeleteSequence(seq.id)
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </div>
          ))}
          {sequences.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4 px-3">No sequences yet</p>
          )}
        </div>

        {/* Actions palette */}
        <div className="border-t border-border shrink-0">
          <div className="px-3 py-2 border-b border-border">
            <span className="text-xs font-medium text-foreground">Actions</span>
          </div>
          <div className="p-2">
            <div
              className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-border bg-card hover:bg-secondary/50 cursor-grab active:cursor-grabbing transition-colors"
              draggable
              onDragStart={e => {
                const action: SequenceAction = { type: 'extract-json', jsonKey: '', envVariable: '' }
                e.dataTransfer.setData('application/sequence-action', JSON.stringify(action))
                e.dataTransfer.effectAllowed = 'copy'
              }}
            >
              <Zap className="h-3 w-3 text-[oklch(0.75_0.18_80)] shrink-0" />
              <span className="text-xs text-foreground">Extract JSON</span>
            </div>
          </div>
        </div>

        {/* Sub-sequences palette — other sequences draggable into the active one */}
        {activeSequence && sequences.filter(s => s.id !== activeSequence.id).length > 0 && (
          <div className="border-t border-border shrink-0">
            <div className="px-3 py-2 border-b border-border">
              <span className="text-xs font-medium text-foreground">Insert Sequence</span>
            </div>
            <div className="p-2 flex flex-col gap-1 max-h-36 overflow-auto">
              {sequences.filter(s => s.id !== activeSequence.id).map(s => {
                const blocked = wouldCreateCycle(sequences, activeSequence.id, s.id)
                return (
                  <div
                    key={s.id}
                    draggable={!blocked}
                    onDragStart={e => {
                      e.dataTransfer.setData('application/sequence-step', JSON.stringify(s))
                      e.dataTransfer.effectAllowed = 'copy'
                    }}
                    title={blocked ? 'Would create a circular reference' : undefined}
                    className={cn(
                      'flex items-center gap-2 px-2 py-1.5 rounded-md border border-border bg-card transition-colors',
                      blocked ? 'opacity-40 cursor-not-allowed' : 'hover:bg-secondary/50 cursor-grab active:cursor-grabbing',
                    )}
                  >
                    <ListOrdered className="h-3 w-3 text-[oklch(0.65_0.2_280)] shrink-0" />
                    <span className="text-xs truncate">{s.name}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <ResizablePanelGroup direction="horizontal" className="flex-1 min-w-0 min-h-0">
      <ResizablePanel defaultSize={40} minSize={20}>
      {/* Step list */}
      <div className="flex flex-col h-full border-r border-border">
        {activeSequence ? (
          <>
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
              <span className="font-medium text-sm truncate flex-1">{activeSequence.name}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                {activeSequence.steps.length} step{activeSequence.steps.length !== 1 ? 's' : ''}
              </span>
              {!isRunning && lastStatusCode !== null && (
                <span className={cn('font-mono text-[10px] font-semibold shrink-0',
                  lastStatusCode < 300 ? 'text-[oklch(0.72_0.19_160)]' : lastStatusCode < 400 ? 'text-[oklch(0.75_0.18_80)]' : 'text-[oklch(0.65_0.22_25)]'
                )}>{lastStatusCode}</span>
              )}
              {!isRunning && totalDuration !== null && (
                <span className="text-xs text-muted-foreground shrink-0">{totalDuration}ms</span>
              )}
              {isRunning ? (
                <Button size="sm" variant="destructive" className="h-7 px-3 gap-1.5" onClick={onStopSequence}>
                  <Square className="h-3 w-3" />
                  Stop
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="h-7 px-3 gap-1.5"
                  disabled={activeSequence.steps.length === 0 || runningSequenceId !== null}
                  onClick={() => onRunSequence(activeSequence)}
                >
                  <Play className="h-3 w-3" />
                  Run
                </Button>
              )}
            </div>

            <div
              ref={dropZoneRef}
              className="flex-1 overflow-auto p-4"
              onDragOver={e => e.preventDefault()}
              onDrop={handleListDrop}
            >
              {activeSequence.steps.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed border-border rounded-lg">
                  <FileJson className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-sm">Drag requests or actions here</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {activeSequence.steps.map((step, idx) => {
                    const result = stepResults[step.id]
                    const isAction = step.type === 'action'
                    const isSelected = selectedStepId === step.id
                    return (
                      <div
                        key={step.id}
                        className={cn(
                          'group rounded-md border border-border bg-card hover:bg-secondary/30 transition-colors',
                          dragOverIdx === idx && dragStepIdx !== idx && 'border-t-2 border-t-primary',
                          dragStepIdx === idx && 'opacity-40',
                          result?.status === 'running' && 'border-[oklch(0.75_0.18_80)]/50',
                          isAction && 'border-dashed',
                          isSelected && 'border-primary bg-secondary/30',
                        )}
                        draggable
                        onDragStart={e => handleStepDragStart(e, idx)}
                        onDragOver={e => handleStepDragOver(e, idx)}
                        onDrop={e => handleStepDrop(e, idx)}
                        onDragEnd={() => { setDragStepIdx(null); setDragOverIdx(null) }}
                        onClick={() => setSelectedStepId(isSelected ? null : step.id)}
                      >
                        {isAction ? (
                          /* Action step */
                          <div className="flex flex-col gap-1.5 px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className="cursor-grab text-muted-foreground opacity-0 group-hover:opacity-50 shrink-0">
                                <GripVertical className="h-3.5 w-3.5" />
                              </span>
                              <span className="text-xs text-muted-foreground w-4 shrink-0 text-right">{idx + 1}</span>
                              <Zap className="h-3 w-3 text-[oklch(0.75_0.18_80)] shrink-0" />
                              <span className="flex-1 text-xs font-medium text-[oklch(0.75_0.18_80)]">Extract JSON</span>
                              <StatusBadge result={result} />
                              <Button
                                variant="ghost" size="icon"
                                className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0"
                                onClick={e => { e.stopPropagation(); removeStep(step.id) }}
                              >
                                <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                              </Button>
                            </div>
                            <div className="flex flex-col gap-1 pl-9">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-muted-foreground w-16 shrink-0">JSON key</span>
                                <div className="flex-1" onClick={e => e.stopPropagation()}>
                                  <VariableHighlightInput
                                    value={step.action?.jsonKey ?? ''}
                                    onChange={v => updateActionStep(step.id, { jsonKey: v })}
                                    placeholder="e.g. data.access_token"
                                    className="h-6 text-[11px]"
                                    variables={variables}
                                    onUpdateVariable={updateVariable}
                                    bare
                                  />
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-muted-foreground w-16 shrink-0">Save to</span>
                                <div className="flex-1" onClick={e => e.stopPropagation()}>
                                  <VariableHighlightInput
                                    value={step.action?.envVariable ?? ''}
                                    onChange={v => updateActionStep(step.id, { envVariable: v })}
                                    placeholder="e.g. ACCESS_TOKEN"
                                    className="h-6 text-[11px]"
                                    variables={variables}
                                    onUpdateVariable={updateVariable}
                                    bare
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : step.type === 'sequence' ? (() => {
                          const { lastCode, total } = subSeqStats(result?.subResults ?? {})
                          return (
                          /* Sub-sequence step */
                          <div className="flex items-center gap-2 px-3 py-2">
                            <span className="cursor-grab text-muted-foreground opacity-0 group-hover:opacity-50 shrink-0">
                              <GripVertical className="h-3.5 w-3.5" />
                            </span>
                            <span className="text-xs text-muted-foreground w-4 shrink-0 text-right">{idx + 1}</span>
                            <ListOrdered className="h-3 w-3 text-[oklch(0.65_0.2_280)] shrink-0" />
                            <span className="flex-1 text-xs truncate">{step.name}</span>
                            <StatusBadge result={result} />
                            {result && result.status !== 'idle' && result.status !== 'running' && lastCode !== null && (
                              <span className={cn('font-mono text-[10px] font-semibold shrink-0',
                                lastCode < 300 ? 'text-[oklch(0.72_0.19_160)]' : lastCode < 400 ? 'text-[oklch(0.75_0.18_80)]' : 'text-[oklch(0.65_0.22_25)]'
                              )}>{lastCode}</span>
                            )}
                            {result && result.status !== 'idle' && result.status !== 'running' && total !== null && (
                              <span className="text-[10px] text-muted-foreground shrink-0">{total}ms</span>
                            )}
                            <Button
                              variant="ghost" size="icon"
                              className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0"
                              onClick={e => { e.stopPropagation(); removeStep(step.id) }}
                            >
                              <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                            </Button>
                          </div>
                          )
                        })() : (
                          /* Request step */
                          <div className="flex items-center gap-2 px-3 py-2">
                            <span className="cursor-grab text-muted-foreground opacity-0 group-hover:opacity-50 shrink-0">
                              <GripVertical className="h-3.5 w-3.5" />
                            </span>
                            <span className="text-xs text-muted-foreground w-4 shrink-0 text-right">{idx + 1}</span>
                            <span className={cn('font-mono text-[10px] font-semibold shrink-0', methodColors[step.method ?? ''] ?? 'text-muted-foreground')}>
                              {step.method}
                            </span>
                            <span className="flex-1 text-xs truncate text-muted-foreground">{step.name}</span>
                            <StatusBadge result={result} />
                            {result?.duration !== undefined && result.status !== 'running' && result.status !== 'idle' && (
                              <span className="text-[10px] text-muted-foreground shrink-0">{result.duration}ms</span>
                            )}
                            <Button
                              variant="ghost" size="icon"
                              className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0"
                              onClick={e => { e.stopPropagation(); removeStep(step.id) }}
                            >
                              <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                            </Button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <Play className="h-10 w-10 mb-3 opacity-20" />
            <p className="text-sm">Create a sequence to get started</p>
          </div>
        )}
      </div>
      </ResizablePanel>

      <ResizableHandle className="w-px bg-border" />

      {/* Detail panel */}
      <ResizablePanel defaultSize={60} minSize={20}>
      <div className="flex flex-col h-full min-w-0">
        <StepDetail
          step={activeSequence?.steps.find(s => s.id === selectedStepId) ?? null}
          result={selectedStepId ? stepResults[selectedStepId] : undefined}
          sequences={sequences}
        />
      </div>
      </ResizablePanel>
      </ResizablePanelGroup>

      {/* New sequence dialog */}
      <Dialog open={isCreating} onOpenChange={o => { if (!o) { setIsCreating(false); setNewName('') } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New Sequence</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreate()
              if (e.key === 'Escape') { setIsCreating(false); setNewName('') }
            }}
            placeholder="Sequence name…"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsCreating(false); setNewName('') }}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!newName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Navigation entry: which sub-sequence step is being viewed, and its results
interface SubNavEntry {
  step: SequenceStep       // the 'sequence' type step that was clicked
  subResults: Record<string, SequenceStepResult>
  sequences: Sequence[]
}

function SubSequencePanel({ initialStep, initialSubResults, sequences }: {
  initialStep: SequenceStep
  initialSubResults: Record<string, SequenceStepResult>
  sequences: Sequence[]
}) {
  // Stack of drill-down levels — index 0 is the root, last is current
  const [stack, setStack] = useState<SubNavEntry[]>([
    { step: initialStep, subResults: initialSubResults, sequences }
  ])

  // Keep root in sync when results update from outside (live run)
  const current = { ...stack[stack.length - 1], subResults: stack.length === 1 ? initialSubResults : stack[stack.length - 1].subResults }

  const drillInto = (step: SequenceStep, subResults: Record<string, SequenceStepResult>) => {
    setStack(prev => [...prev, { step, subResults, sequences }])
  }
  const goBack = () => setStack(prev => prev.slice(0, -1))

  const sub = sequences.find(s => s.id === current.step.sequenceId)
  const subResults = current.subResults
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null)
  const selectedStep = sub?.steps.find(s => s.id === selectedStepId) ?? null
  const selectedResult = selectedStepId ? subResults[selectedStepId] : undefined

  if (!sub) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
          {stack.length > 1 && (
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={goBack}>
              <ArrowLeft className="h-3.5 w-3.5" />
            </Button>
          )}
          <ListOrdered className="h-4 w-4 text-[oklch(0.65_0.2_280)] shrink-0" />
          <span className="text-sm font-medium flex-1">{current.step.name}</span>
        </div>
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <p className="text-sm">Sequence not found</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header with optional back button and breadcrumb */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        {stack.length > 1 && (
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={goBack}>
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>
        )}
        <ListOrdered className="h-4 w-4 text-[oklch(0.65_0.2_280)] shrink-0" />
        <span className="text-sm font-medium flex-1 truncate">
          {stack.map((e, i) => (
            <span key={i}>
              {i > 0 && <span className="mx-1 text-muted-foreground">/</span>}
              <span className={i < stack.length - 1 ? 'text-muted-foreground' : ''}>{e.step.name}</span>
            </span>
          ))}
        </span>
        <span className="text-xs text-muted-foreground shrink-0">{sub.steps.length} step{sub.steps.length !== 1 ? 's' : ''}</span>
      </div>

      <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0">
        <ResizablePanel defaultSize={40} minSize={20}>
          <div className="flex flex-col h-full overflow-auto p-3 gap-1">
            {sub.steps.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No steps</p>
            ) : sub.steps.map((subStep, idx) => {
              const subResult = subResults[subStep.id]
              const isSelected = selectedStepId === subStep.id
              return (
                <div
                  key={subStep.id}
                  onClick={() => setSelectedStepId(isSelected ? null : subStep.id)}
                  className={cn(
                    'flex items-center gap-2 px-2 py-1.5 rounded-md border border-border cursor-pointer hover:bg-secondary/30 transition-colors',
                    isSelected && 'border-primary bg-secondary/30',
                    subResult?.status === 'running' && 'border-[oklch(0.75_0.18_80)]/50',
                  )}
                >
                  <span className="text-xs text-muted-foreground w-4 shrink-0 text-right">{idx + 1}</span>
                  {subStep.type === 'action' ? (
                    <Zap className="h-3 w-3 text-[oklch(0.75_0.18_80)] shrink-0" />
                  ) : subStep.type === 'sequence' ? (
                    <ListOrdered className="h-3 w-3 text-[oklch(0.65_0.2_280)] shrink-0" />
                  ) : (
                    <span className={cn('font-mono text-[10px] font-semibold shrink-0', methodColors[subStep.method ?? ''] ?? 'text-muted-foreground')}>
                      {subStep.method}
                    </span>
                  )}
                  <span className="flex-1 text-xs truncate">{subStep.name}</span>
                  <StatusBadge result={subResult} />
                  {subStep.type === 'request' && subResult?.duration !== undefined && subResult.status !== 'idle' && subResult.status !== 'running' && (
                    <span className="text-[10px] text-muted-foreground shrink-0">{subResult.duration}ms</span>
                  )}
                  {subStep.type === 'sequence' && subResult && subResult.status !== 'idle' && subResult.status !== 'running' && (() => {
                    const { lastCode, total } = subSeqStats(subResult.subResults ?? {})
                    return <>
                      {lastCode !== null && (
                        <span className={cn('font-mono text-[10px] font-semibold shrink-0',
                          lastCode < 300 ? 'text-[oklch(0.72_0.19_160)]' : lastCode < 400 ? 'text-[oklch(0.75_0.18_80)]' : 'text-[oklch(0.65_0.22_25)]'
                        )}>{lastCode}</span>
                      )}
                      {total !== null && <span className="text-[10px] text-muted-foreground shrink-0">{total}ms</span>}
                    </>
                  })()}
                </div>
              )
            })}
          </div>
        </ResizablePanel>
        <ResizableHandle className="w-px bg-border" />
        <ResizablePanel defaultSize={60} minSize={20}>
          <div className="flex flex-col h-full min-h-0">
            {selectedStep?.type === 'sequence' ? (
              // Drill into nested sub-sequence — clicking replaces this panel
              <div className="flex flex-col h-full items-center justify-center gap-3 text-muted-foreground p-4">
                <ListOrdered className="h-8 w-8 opacity-20" />
                <p className="text-sm text-center">Click to view <span className="font-medium text-foreground">{selectedStep.name}</span></p>
                <Button size="sm" variant="outline" className="gap-2" onClick={() => drillInto(selectedStep, selectedResult?.subResults ?? {})}>
                  <ChevronRight className="h-3.5 w-3.5" />
                  Open
                </Button>
              </div>
            ) : selectedStep?.type === 'request' ? (
              <>
                <div className="flex items-center gap-3 px-3 py-2 border-b border-border shrink-0">
                  <span className={cn('font-mono text-[10px] font-semibold shrink-0', methodColors[selectedStep.method ?? ''] ?? 'text-muted-foreground')}>
                    {selectedStep.method}
                  </span>
                  <span className="text-xs font-medium truncate flex-1">{selectedStep.name}</span>
                  {selectedResult?.duration !== undefined && selectedResult.status !== 'idle' && selectedResult.status !== 'running' && (
                    <span className="text-xs text-muted-foreground shrink-0">{selectedResult.duration}ms</span>
                  )}
                </div>
                <div className="flex-1 min-h-0">
                  <ResponseViewer response={selectedResult?.response ?? null} isLoading={selectedResult?.status === 'running'} />
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
                <ChevronRight className="h-6 w-6 opacity-20" />
                <p className="text-sm">{selectedStep ? 'No response for this step' : 'Click a step to see its result'}</p>
              </div>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}

function StepDetail({ step, result, sequences }: { step: SequenceStep | null; result?: SequenceStepResult; sequences: Sequence[] }) {
  const { variables } = useEnvironmentContext()
  if (!step) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground h-full">
        <ChevronRight className="h-8 w-8 mb-2 opacity-20" />
        <p className="text-sm">Click a step to see its result</p>
      </div>
    )
  }

  if (step.type === 'sequence') {
    return <SubSequencePanel initialStep={step} initialSubResults={result?.subResults ?? {}} sequences={sequences} />
  }

  if (step.type === 'request') {
    return (
      <div className="flex flex-col h-full min-h-0">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
          <span className={cn('font-mono text-xs font-semibold shrink-0', methodColors[step.method ?? ''] ?? 'text-muted-foreground')}>
            {step.method}
          </span>
          <span className="text-sm font-medium truncate flex-1">{step.name}</span>
          {result?.duration !== undefined && result.status !== 'idle' && result.status !== 'running' && (
            <span className="text-xs text-muted-foreground shrink-0">{result.duration}ms</span>
          )}
        </div>
        <div className="flex-1 min-h-0">
          <ResponseViewer response={result?.response ?? null} isLoading={result?.status === 'running'} />
        </div>
      </div>
    )
  }

  // Action step
  const { action } = step
  const statusColor = !result || result.status === 'idle' ? 'text-muted-foreground'
    : result.status === 'running' ? 'text-[oklch(0.75_0.18_80)]'
    : result.status === 'success' ? 'text-[oklch(0.72_0.19_160)]'
    : 'text-[oklch(0.65_0.22_25)]'

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <Zap className="h-4 w-4 text-[oklch(0.75_0.18_80)] shrink-0" />
        <span className="text-sm font-medium flex-1">Extract JSON</span>
      </div>
      <div className="p-4 space-y-4">
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Configuration</p>
          <div className="rounded-md border border-border bg-card p-3 space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-20 shrink-0">JSON key</span>
              {action?.jsonKey ? (
                <div className="flex-1">
                  <VariableHighlightInput value={action.jsonKey} onChange={() => {}} variables={variables} readOnly bare className="h-5 text-xs" />
                </div>
              ) : <span className="text-xs text-muted-foreground italic">not set</span>}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-20 shrink-0">Save to</span>
              {action?.envVariable ? (
                <div className="flex-1">
                  <VariableHighlightInput value={action.envVariable} onChange={() => {}} variables={variables} readOnly bare className="h-5 text-xs" />
                </div>
              ) : <span className="text-xs text-muted-foreground italic">not set</span>}
            </div>
          </div>
        </div>

        {result && result.status !== 'idle' && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Result</p>
            <div className="rounded-md border border-border bg-card p-3 space-y-2">
              <div className="flex gap-3">
                <span className="text-xs text-muted-foreground w-20 shrink-0">Status</span>
                <span className={cn('text-xs font-semibold capitalize', statusColor)}>
                  {result.status}
                </span>
              </div>
              {result.extractedValue !== undefined && (
                <div className="flex gap-3">
                  <span className="text-xs text-muted-foreground w-20 shrink-0">Value</span>
                  <span className="text-xs font-mono text-[oklch(0.72_0.19_160)] break-all">{result.extractedValue}</span>
                </div>
              )}
              {result.error && (
                <div className="flex gap-3">
                  <span className="text-xs text-muted-foreground w-20 shrink-0">Error</span>
                  <span className="text-xs text-[oklch(0.65_0.22_25)] break-all">{result.error}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
