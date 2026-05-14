'use client'

import { useState, useRef, useCallback } from 'react'
import type { Sequence, SequenceStep, SequenceStepResult, SequenceAction, RequestConfig } from '@/lib/db/types'
import { generateId } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Play, Plus, Trash2, GripVertical, X, FileJson, Square, Zap } from 'lucide-react'

const methodColors: Record<string, string> = {
  GET: 'text-[oklch(0.72_0.19_160)]',
  POST: 'text-[oklch(0.75_0.18_80)]',
  PUT: 'text-[oklch(0.65_0.2_250)]',
  PATCH: 'text-[oklch(0.7_0.15_300)]',
  DELETE: 'text-[oklch(0.65_0.22_25)]',
  HEAD: 'text-[oklch(0.6_0.12_200)]',
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

interface SequenceBuilderProps {
  sequences: Sequence[]
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
  onCreateSequence,
  onUpdateSequence,
  onDeleteSequence,
  onRunSequence,
  onStopSequence,
  runningSequenceId,
  stepResults,
}: SequenceBuilderProps) {
  const [activeSequenceId, setActiveSequenceId] = useState<string | null>(sequences[0]?.id ?? null)
  const [newName, setNewName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const [dragStepIdx, setDragStepIdx] = useState<number | null>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)

  const activeSequence = sequences.find(s => s.id === activeSequenceId) ?? null
  const isRunning = runningSequenceId === activeSequenceId

  const handleCreate = () => {
    if (!newName.trim()) return
    const seq: Sequence = {
      id: generateId(),
      name: newName.trim(),
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
        {isCreating && (
          <div className="px-2 py-2 flex gap-1 border-b border-border">
            <Input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') { setIsCreating(false); setNewName('') }
              }}
              placeholder="Sequence name"
              className="h-7 text-xs"
            />
            <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={handleCreate}>
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        )}
        <div className="flex-1 overflow-auto py-1 min-h-0">
          {sequences.map(seq => (
            <div
              key={seq.id}
              className={cn(
                'group flex items-center px-3 py-1.5 cursor-pointer hover:bg-secondary/50',
                activeSequenceId === seq.id && 'bg-secondary',
              )}
              onClick={() => setActiveSequenceId(seq.id)}
            >
              <span className="flex-1 text-xs truncate">{seq.name}</span>
              <Button
                variant="ghost" size="icon"
                className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0"
                onClick={e => {
                  e.stopPropagation()
                  if (activeSequenceId === seq.id) setActiveSequenceId(sequences.find(s => s.id !== seq.id)?.id ?? null)
                  onDeleteSequence(seq.id)
                }}
              >
                <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
              </Button>
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
      </div>

      {/* Step editor */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeSequence ? (
          <>
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
              <span className="font-medium text-sm truncate flex-1">{activeSequence.name}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                {activeSequence.steps.length} step{activeSequence.steps.length !== 1 ? 's' : ''}
              </span>
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
                    return (
                      <div
                        key={step.id}
                        className={cn(
                          'group rounded-md border border-border bg-card hover:bg-secondary/30 transition-colors',
                          dragOverIdx === idx && dragStepIdx !== idx && 'border-t-2 border-t-primary',
                          dragStepIdx === idx && 'opacity-40',
                          result?.status === 'running' && 'border-[oklch(0.75_0.18_80)]/50',
                          isAction && 'border-dashed',
                        )}
                        draggable
                        onDragStart={e => handleStepDragStart(e, idx)}
                        onDragOver={e => handleStepDragOver(e, idx)}
                        onDrop={e => handleStepDrop(e, idx)}
                        onDragEnd={() => { setDragStepIdx(null); setDragOverIdx(null) }}
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
                                onClick={() => removeStep(step.id)}
                              >
                                <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                              </Button>
                            </div>
                            <div className="flex flex-col gap-1 pl-9">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-muted-foreground w-16 shrink-0">JSON key</span>
                                <Input
                                  value={step.action?.jsonKey ?? ''}
                                  onChange={e => updateActionStep(step.id, { jsonKey: e.target.value })}
                                  placeholder="e.g. data.access_token"
                                  className="h-6 text-[11px] font-mono px-2"
                                  onClick={e => e.stopPropagation()}
                                />
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-muted-foreground w-16 shrink-0">Save to</span>
                                <Input
                                  value={step.action?.envVariable ?? ''}
                                  onChange={e => updateActionStep(step.id, { envVariable: e.target.value })}
                                  placeholder="e.g. ACCESS_TOKEN"
                                  className="h-6 text-[11px] font-mono px-2"
                                  onClick={e => e.stopPropagation()}
                                />
                              </div>
                            </div>
                          </div>
                        ) : (
                          /* Request step */
                          <div className="flex items-center gap-2 px-3 py-2">
                            <span className="cursor-grab text-muted-foreground opacity-0 group-hover:opacity-50 shrink-0">
                              <GripVertical className="h-3.5 w-3.5" />
                            </span>
                            <span className="text-xs text-muted-foreground w-4 shrink-0 text-right">{idx + 1}</span>
                            <span className={cn('font-mono text-[10px] font-semibold w-12 shrink-0', methodColors[step.method ?? ''] ?? 'text-muted-foreground')}>
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
                              onClick={() => removeStep(step.id)}
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
    </div>
  )
}
