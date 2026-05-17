'use client'

import { useState, useCallback, useEffect } from 'react'
import type { WorkspaceTab, SocketTab, HttpMethod, SocketProtocol } from '@/lib/db/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { X, Plus, Circle, KeyRound, Wifi, Zap } from 'lucide-react'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'

export type TabOrderEntry = { id: string; kind: 'http' | 'socket' }

interface TabBarProps {
  tabs: WorkspaceTab[]
  socketTabs: SocketTab[]
  tabOrder: TabOrderEntry[]
  activeTabId: string | null
  flashTabId: string | null
  onSelectTab: (id: string) => void
  onCloseTab: (id: string) => void
  onNewTab: () => void
  onNewSocketTab: (protocol: SocketProtocol) => void
  onReorderTabs: (reordered: WorkspaceTab[]) => void
  onReorderTabOrder: (reordered: TabOrderEntry[]) => void
}

const methodColors: Record<HttpMethod, string> = {
  GET: 'text-[oklch(0.88_0.15_140)]',
  POST: 'text-[oklch(0.88_0.14_75)]',
  PUT: 'text-[oklch(0.88_0.13_240)]',
  PATCH: 'text-[oklch(0.88_0.13_300)]',
  DELETE: 'text-[oklch(0.88_0.14_15)]',
  HEAD: 'text-[oklch(0.88_0.11_195)]',
  OPTIONS: 'text-muted-foreground',
}

const protocolColors: Record<SocketProtocol, string> = {
  ws: 'text-[oklch(0.72_0.19_160)]',
  socketio: 'text-[oklch(0.65_0.2_250)]',
}

const socketStatusColors = {
  connecting: 'text-[oklch(0.75_0.18_80)]',
  connected: 'text-[oklch(0.72_0.19_160)]',
  error: 'text-[oklch(0.65_0.22_25)]',
}

const protocolLabel: Record<SocketProtocol, string> = {
  ws: 'WS',
  socketio: 'SIO',
}

export function TabBar({
  tabs,
  socketTabs,
  tabOrder,
  activeTabId,
  flashTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onNewSocketTab,
  onReorderTabs,
  onReorderTabOrder,
}: TabBarProps) {
  const [dragTabId, setDragTabId] = useState<string | null>(null)
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null)
  const [flashingId, setFlashingId] = useState<string | null>(null)

  useEffect(() => {
    if (!flashTabId) return
    setFlashingId(flashTabId)
    const t = setTimeout(() => setFlashingId(null), 600)
    return () => clearTimeout(t)
  }, [flashTabId])

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    setDragTabId(id)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverTabId(id)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    if (!dragTabId || dragTabId === targetId) {
      setDragTabId(null)
      setDragOverTabId(null)
      return
    }
    const from = tabOrder.findIndex(t => t.id === dragTabId)
    const to = tabOrder.findIndex(t => t.id === targetId)
    if (from === -1 || to === -1) { setDragTabId(null); setDragOverTabId(null); return }
    const reordered = [...tabOrder]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(to, 0, moved)
    onReorderTabOrder(reordered)
    // Also sync the http-only reorder for persistence
    const httpReordered = reordered.filter(e => e.kind === 'http').map(e => tabs.find(t => t.id === e.id)!).filter(Boolean)
    if (httpReordered.length === tabs.length) onReorderTabs(httpReordered)
    setDragTabId(null)
    setDragOverTabId(null)
  }, [tabOrder, dragTabId, tabs, onReorderTabOrder, onReorderTabs])

  const handleDragEnd = useCallback(() => {
    setDragTabId(null)
    setDragOverTabId(null)
  }, [])

  const httpMap = new Map(tabs.map(t => [t.id, t]))
  const socketMap = new Map(socketTabs.map(t => [t.id, t]))

  return (
    <div className="flex items-center border-b border-border bg-card">
      <ScrollArea className="flex-1">
        <div className="flex">
          {tabOrder.map(entry => {
            const isActive = entry.id === activeTabId
            const isDragging = dragTabId === entry.id
            const isDragOver = dragOverTabId === entry.id && dragTabId !== entry.id

            if (entry.kind === 'http') {
              const tab = httpMap.get(entry.id)
              if (!tab) return null
              const tabName = tab.request.name || 'Untitled'
              const method = tab.request.method
              const isFlashing = flashingId === tab.id
              return (
                <div
                  key={tab.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, tab.id)}
                  onDragOver={(e) => handleDragOver(e, tab.id)}
                  onDrop={(e) => handleDrop(e, tab.id)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    'group flex items-center gap-2 px-3 py-2 border-r border-border cursor-pointer min-w-[140px] max-w-[200px] select-none',
                    isActive ? 'bg-background border-b-2 border-b-primary -mb-px' : 'bg-card hover:bg-secondary/50',
                    isDragging && 'opacity-40',
                    isDragOver && 'border-l-2 border-l-primary',
                    isFlashing && 'tab-flash',
                  )}
                  onClick={() => onSelectTab(tab.id)}
                  onMouseDown={(e) => { if (e.button === 1) { e.preventDefault(); onCloseTab(tab.id) } }}
                >
                  <span className={cn('font-mono text-xs shrink-0', methodColors[method])}>
                    {method}
                  </span>
                  <span className="text-sm truncate flex-1 text-foreground">{tabName}</span>
                  {tab.isDirty && <Circle className="h-2 w-2 fill-primary text-primary shrink-0" />}
                  <Button
                    variant="ghost" size="icon"
                    className="h-4 w-4 opacity-0 group-hover:opacity-100 shrink-0"
                    onClick={(e) => { e.stopPropagation(); onCloseTab(tab.id) }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )
            } else {
              const tab = socketMap.get(entry.id)
              if (!tab) return null
              const tabName = tab.config.name || 'New Socket'
              const protocol = tab.config.protocol ?? 'ws'
              const isFlashing = flashingId === tab.id
              return (
                <div
                  key={tab.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, tab.id)}
                  onDragOver={(e) => handleDragOver(e, tab.id)}
                  onDrop={(e) => handleDrop(e, tab.id)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    'group flex items-center gap-2 px-3 py-2 border-r border-border cursor-pointer min-w-[140px] max-w-[200px] select-none',
                    isActive ? 'bg-background border-b-2 border-b-primary -mb-px' : 'bg-card hover:bg-secondary/50',
                    isDragging && 'opacity-40',
                    isDragOver && 'border-l-2 border-l-primary',
                    isFlashing && 'tab-flash',
                  )}
                  onClick={() => onSelectTab(tab.id)}
                  onMouseDown={(e) => { if (e.button === 1) { e.preventDefault(); onCloseTab(tab.id) } }}
                >
                  <span className={cn(
                    'font-mono text-xs font-semibold shrink-0',
                    tab.connectionStatus === 'disconnected'
                      ? protocolColors[protocol]
                      : socketStatusColors[tab.connectionStatus]
                  )}>
                    {protocolLabel[protocol]}
                  </span>
                  <span className="text-sm truncate flex-1 text-foreground">{tabName}</span>
                  {tab.isDirty && <Circle className="h-2 w-2 fill-primary text-primary shrink-0" />}
                  <Button
                    variant="ghost" size="icon"
                    className="h-4 w-4 opacity-0 group-hover:opacity-100 shrink-0"
                    onClick={(e) => { e.stopPropagation(); onCloseTab(tab.id) }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )
            }
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost" size="icon"
            className="h-9 w-9 shrink-0 rounded-none border-l border-border"
            title="New tab"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={onNewTab}>
            <KeyRound className="h-3.5 w-3.5 mr-2 shrink-0" />
            New Request
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onNewSocketTab('ws')}>
            <Wifi className="h-3.5 w-3.5 mr-2 shrink-0" />
            WebSocket
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onNewSocketTab('socketio')}>
            <Zap className="h-3.5 w-3.5 mr-2 shrink-0" />
            Socket.IO
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
