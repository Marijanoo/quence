'use client'

import type { WorkspaceTab, HttpMethod } from '@/lib/db/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { X, Plus, Circle } from 'lucide-react'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'

interface TabBarProps {
  tabs: WorkspaceTab[]
  activeTabId: string | null
  onSelectTab: (id: string) => void
  onCloseTab: (id: string) => void
  onNewTab: () => void
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

export function TabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
}: TabBarProps) {
  return (
    <div className="flex items-center border-b border-border bg-card">
      <ScrollArea className="flex-1">
        <div className="flex">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId
            const tabName = tab.request.name || 'Untitled'
            const method = tab.request.method

            return (
              <div
                key={tab.id}
                className={cn(
                  'group flex items-center gap-2 px-3 py-2 border-r border-border cursor-pointer min-w-[140px] max-w-[200px]',
                  isActive
                    ? 'bg-background border-b-2 border-b-primary -mb-px'
                    : 'bg-card hover:bg-secondary/50'
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
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 shrink-0 rounded-none border-l border-border"
        onClick={onNewTab}
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  )
}
