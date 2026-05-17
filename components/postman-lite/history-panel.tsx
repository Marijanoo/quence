'use client'

import type { HistoryEntry, HttpMethod } from '@/lib/db/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { History, Trash2, Clock } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

interface HistoryPanelProps {
  history: HistoryEntry[]
  onOpenRequest: (entry: HistoryEntry) => void
  onDeleteEntry: (id: string) => void
  onClearHistory: () => void
  readOnly?: boolean
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

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  
  // Less than 1 minute
  if (diff < 60000) return 'Just now'
  // Less than 1 hour
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  // Less than 24 hours
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  // Same year
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function extractPath(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.pathname + parsed.search
  } catch {
    return url
  }
}

export function HistoryPanel({
  history,
  onOpenRequest,
  onDeleteEntry,
  onClearHistory,
  readOnly,
}: HistoryPanelProps) {
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <h3 className="text-sm font-medium text-foreground">History</h3>
        {history.length > 0 && !readOnly && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground">
                Clear
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear History</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all history entries. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onClearHistory}>Clear</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <History className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-xs">No history yet</p>
          </div>
        ) : (
          <div className="py-1">
            {history.map((entry) => (
              <div
                key={entry.id}
                className="group flex items-center hover:bg-secondary/50 px-3"
              >
                <button
                  onClick={() => onOpenRequest(entry)}
                  className="flex items-center flex-1 py-2 text-left"
                >
                  <span className={cn('font-mono text-xs mr-2 w-12 shrink-0', methodColors[entry.request.method])}>
                    {entry.request.method}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate font-mono">
                      {extractPath(entry.request.url)}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>{formatTimestamp(entry.timestamp)}</span>
                      {entry.response && (
                        <span className={cn(
                          entry.response.status >= 200 && entry.response.status < 300
                            ? 'text-[oklch(0.72_0.19_160)]'
                            : entry.response.status >= 400
                            ? 'text-[oklch(0.65_0.22_25)]'
                            : ''
                        )}>
                          {entry.response.status}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
                {!readOnly && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100"
                    onClick={() => onDeleteEntry(entry.id)}
                  >
                    <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
