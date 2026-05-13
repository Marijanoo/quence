'use client'

import type { Collection, RequestConfig, HistoryEntry, Environment } from '@/lib/db/types'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CollectionsPanel } from './collections-panel'
import { HistoryPanel } from './history-panel'
import { EnvironmentsPanel } from './environments-panel'
import { FolderOpen, History, Settings } from 'lucide-react'

interface SidebarProps {
  collections: Collection[]
  requests: RequestConfig[]
  history: HistoryEntry[]
  environments: Environment[]
  activeEnvironment?: Environment
  onCreateCollection: (name: string) => void
  onDeleteCollection: (id: string) => void
  onRenameCollection: (id: string, name: string) => void
  onOpenRequest: (request: RequestConfig) => void
  onDeleteRequest: (id: string) => void
  onSaveRequest: (request: RequestConfig, collectionId: string) => void
  onImportCollection: (collection: Collection, requests: RequestConfig[]) => void
  onOpenHistoryEntry: (entry: HistoryEntry) => void
  onDeleteHistoryEntry: (id: string) => void
  onClearHistory: () => void
  onCreateEnvironment: (name: string) => void
  onImportEnvironment: (env: Environment) => void
  onDeleteEnvironment: (id: string) => void
  onUpdateEnvironment: (id: string, data: Partial<Environment>) => void
  onSetActiveEnvironment: (id: string | null) => void
}

export function Sidebar({
  collections,
  requests,
  history,
  environments,
  activeEnvironment,
  onCreateCollection,
  onDeleteCollection,
  onRenameCollection,
  onOpenRequest,
  onDeleteRequest,
  onSaveRequest,
  onImportCollection,
  onOpenHistoryEntry,
  onDeleteHistoryEntry,
  onClearHistory,
  onCreateEnvironment,
  onImportEnvironment,
  onDeleteEnvironment,
  onUpdateEnvironment,
  onSetActiveEnvironment,
}: SidebarProps) {
  return (
    <Tabs defaultValue="collections" className="h-full flex flex-col">
      <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent h-auto p-0 shrink-0">
        <TabsTrigger
          value="collections"
          className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-2"
        >
          <FolderOpen className="h-4 w-4" />
        </TabsTrigger>
        <TabsTrigger
          value="history"
          className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-2"
        >
          <History className="h-4 w-4" />
        </TabsTrigger>
        <TabsTrigger
          value="environments"
          className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-2"
        >
          <Settings className="h-4 w-4" />
        </TabsTrigger>
      </TabsList>

      <TabsContent value="collections" className="flex-1 m-0 overflow-hidden">
        <CollectionsPanel
          collections={collections}
          requests={requests}
          onCreateCollection={onCreateCollection}
          onDeleteCollection={onDeleteCollection}
          onRenameCollection={onRenameCollection}
          onOpenRequest={onOpenRequest}
          onDeleteRequest={onDeleteRequest}
          onSaveRequest={onSaveRequest}
          onImportCollection={onImportCollection}
        />
      </TabsContent>

      <TabsContent value="history" className="flex-1 m-0 overflow-hidden">
        <HistoryPanel
          history={history}
          onOpenRequest={onOpenHistoryEntry}
          onDeleteEntry={onDeleteHistoryEntry}
          onClearHistory={onClearHistory}
        />
      </TabsContent>

      <TabsContent value="environments" className="flex-1 m-0 overflow-hidden">
        <EnvironmentsPanel
          environments={environments}
          activeEnvironment={activeEnvironment}
          onCreateEnvironment={onCreateEnvironment}
          onImportEnvironment={onImportEnvironment}
          onDeleteEnvironment={onDeleteEnvironment}
          onUpdateEnvironment={onUpdateEnvironment}
          onSetActive={onSetActiveEnvironment}
        />
      </TabsContent>
    </Tabs>
  )
}
