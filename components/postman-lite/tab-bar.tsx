'use client'

import { useState, useCallback } from 'react'
import type { WorkspaceTab, SocketTab, HttpMethod, SocketProtocol } from '@/lib/db/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { X, Plus, Circle, Wifi, ChevronDown } from 'lucide-react'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'

type AnyTab = { id: string; isDirty: boolean } & (
  | { kind: 'http'; tab: WorkspaceTab }
  | { kind: 'socket'; tab: SocketTab }
)

interface TabBarProps {
  tabs: WorkspaceTab[]
  socketTabs: SocketTab[]
  activeTabId: string | null
  onSelectTab: (id: string) => void
  onCloseTab: (id: string) => void
  onNewTab: () => void
  onNewSocketTab: (protocol: SocketProtocol) => void
  onReorderTabs: (reordered: WorkspaceTab[]) => void
}

const methodColors: Record<HttpMethod, string> = {
  GET: 'text-[oklch(0.72_0.19_160)]',
  POST: 'text-[oklch(0.75_0.18_80)]',
  PUT: 'text-[oklch(0.65_0.2_250)]',
  PATCH: 'text-[oklch(0.7_0.15_300)]',
  DELETE: 'text-[oklch(0.65_0.22_25)]',
  HEAD: 'text-[oklch(0.6_0.12_200)]',
  OPTIONS: 'text-muted-foreground',
}

const socketStatusColors = {
  disconnected: 'text-muted-foreground',
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
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onNewSocketTab,
  onReorderTabs,
}: TabBarProps) {
  const [dragTabId, setDragTabId] = useState<string | null>(null)
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null)

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
    const from = tabs.findIndex(t => t.id === dragTabId)
    const to = tabs.findIndex(t => t.id === targetId)
    if (from === -1 || to === -1) return
    const reordered = [...tabs]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(to, 0, moved)
    onReorderTabs(reordered)
    setDragTabId(null)
    setDragOverTabId(null)
  }, [tabs, dragTabId, onReorderTabs])

  const handleDragEnd = useCallback(() => {
    setDragTabId(null)
    setDragOverTabId(null)
  }, [])

  return (
    <div className="flex items-center border-b border-border bg-card">
      <ScrollArea className="flex-1">
        <div className="flex">
          {/* HTTP tabs */}
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId
            const isDragging = dragTabId === tab.id
            const isDragOver = dragOverTabId === tab.id && dragTabId !== tab.id
            const tabName = tab.request.name || 'Untitled'
            const method = tab.request.method

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
                  isActive
                    ? 'bg-background border-b-2 border-b-primary -mb-px'
                    : 'bg-card hover:bg-secondary/50',
                  isDragging && 'opacity-40',
                  isDragOver && 'border-l-2 border-l-primary',
                )}
                onClick={() => onSelectTab(tab.id)}
              >
                <span className={cn('font-mono text-xs shrink-0', methodColors[method])}>
                  {method}
                </span>
                <span className="text-sm truncate flex-1 text-foreground">
                  {tabName}
                </span>
                {tab.isDirty && (
                  <Circle className="h-2 w-2 fill-primary text-primary shrink-0" />
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 opacity-0 group-hover:opacity-100 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    onCloseTab(tab.id)
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )
          })}

          {/* Socket tabs */}
          {socketTabs.map((tab) => {
            const isActive = tab.id === activeTabId
            const tabName = tab.config.name || 'New Socket'
            const protocol = tab.config.protocol ?? 'ws'

            return (
              <div
                key={tab.id}
                className={cn(
                  'group flex items-center gap-2 px-3 py-2 border-r border-border cursor-pointer min-w-[140px] max-w-[200px] select-none',
                  isActive
                    ? 'bg-background border-b-2 border-b-primary -mb-px'
                    : 'bg-card hover:bg-secondary/50',
                )}
                onClick={() => onSelectTab(tab.id)}
              >
                <span className={cn('font-mono text-[10px] font-semibold shrink-0', socketStatusColors[tab.connectionStatus])}>
                  {protocolLabel[protocol]}
                </span>
                <span className="text-sm truncate flex-1 text-foreground">
                  {tabName}
                </span>
                {tab.isDirty && (
                  <Circle className="h-2 w-2 fill-primary text-primary shrink-0" />
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 opacity-0 group-hover:opacity-100 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    onCloseTab(tab.id)
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 shrink-0 rounded-none border-l border-border"
        onClick={onNewTab}
        title="New HTTP request"
      >
        <Plus className="h-4 w-4" />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="h-9 px-2 shrink-0 rounded-none border-l border-border flex items-center gap-0.5"
            title="New socket connection"
          >
            <Wifi className="h-4 w-4" />
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => onNewSocketTab('ws')}>
            <span className="font-mono text-xs font-semibold text-[oklch(0.72_0.19_160)] w-8">WS</span>
            WebSocket
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onNewSocketTab('socketio')}>
            <span className="font-mono text-xs font-semibold text-[oklch(0.65_0.2_250)] w-8">SIO</span>
            Socket.IO
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
