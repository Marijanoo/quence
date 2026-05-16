'use client'

import type { Collection, RequestConfig, SocketConfig, HistoryEntry, Environment, Workspace } from '@/lib/db/types'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CollectionsPanel } from './collections-panel'
import { HistoryPanel } from './history-panel'
import { EnvironmentsPanel } from './environments-panel'
import { InvitesPanel } from './invites-panel'
import { FolderOpen, History, Settings, Mail } from 'lucide-react'
import { useMyInvites } from '@/hooks/use-collaboration'

interface SidebarProps {
  collections: Collection[]
  requests: RequestConfig[]
  history: HistoryEntry[]
  environments: Environment[]
  activeEnvironment?: Environment
  canWrite: boolean
  onCreateCollection: (name: string) => void
  onDeleteCollection: (id: string) => void
  onRenameCollection: (id: string, name: string) => void
  onReorderCollections: (ordered: Collection[]) => void
  onReorderRequests: (ordered: RequestConfig[]) => void
  onMoveRequest: (requestId: string, targetCollectionId: string) => void
  onOpenRequest: (request: RequestConfig) => void
  onDeleteRequest: (id: string) => void
  onSaveRequest: (request: RequestConfig, collectionId: string) => void
  onImportCollection: (collection: Collection, requests: RequestConfig[], socketConfigs?: SocketConfig[]) => void
  socketConfigs?: SocketConfig[]
  onOpenSocketConfig?: (config: SocketConfig) => void
  onDeleteSocketConfig?: (id: string) => void
  onRenameRequest?: (id: string, name: string) => void
  onRenameSocketConfig?: (id: string, name: string) => void
  sequenceDragMode?: boolean
  onOpenHistoryEntry: (entry: HistoryEntry) => void
  onDeleteHistoryEntry: (id: string) => void
  onClearHistory: () => void
  onCreateEnvironment: (name: string) => void
  onImportEnvironment: (env: Environment) => void
  onDeleteEnvironment: (id: string) => void
  onUpdateEnvironment: (id: string, data: Partial<Environment>) => void
  onSetActiveEnvironment: (id: string | null) => void
  onInviteAccepted: (workspace: Workspace) => void
  onUpdateWorkspace: (id: string, data: Partial<Workspace>) => Promise<void>
  getWorkspace: (id: string) => Workspace | undefined
}

export function Sidebar({
  collections,
  requests,
  history,
  environments,
  activeEnvironment,
  canWrite,
  onCreateCollection,
  onDeleteCollection,
  onRenameCollection,
  onReorderCollections,
  onReorderRequests,
  onMoveRequest,
  onOpenRequest,
  onDeleteRequest,
  onSaveRequest,
  onImportCollection,
  socketConfigs,
  onOpenSocketConfig,
  onDeleteSocketConfig,
  onRenameRequest,
  onRenameSocketConfig,
  sequenceDragMode,
  onOpenHistoryEntry,
  onDeleteHistoryEntry,
  onClearHistory,
  onCreateEnvironment,
  onImportEnvironment,
  onDeleteEnvironment,
  onUpdateEnvironment,
  onSetActiveEnvironment,
  onInviteAccepted,
  onUpdateWorkspace,
  getWorkspace,
}: SidebarProps) {
  const { invites } = useMyInvites()

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
        <TabsTrigger
          value="invites"
          className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-2 relative"
        >
          <Mail className="h-4 w-4" />
          {invites.length > 0 && (
            <span className="absolute top-1.5 right-2 h-2 w-2 rounded-full bg-primary" />
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="collections" forceMount className="flex-1 m-0 overflow-hidden data-[state=inactive]:hidden">
        <CollectionsPanel
          collections={collections}
          requests={requests}
          canWrite={canWrite}
          onCreateCollection={onCreateCollection}
          onDeleteCollection={onDeleteCollection}
          onRenameCollection={onRenameCollection}
          onReorderCollections={onReorderCollections}
          onReorderRequests={onReorderRequests}
          onMoveRequest={onMoveRequest}
          onOpenRequest={onOpenRequest}
          onDeleteRequest={onDeleteRequest}
          onSaveRequest={onSaveRequest}
          socketConfigs={socketConfigs}
          onImportCollection={onImportCollection}
          onOpenSocketConfig={onOpenSocketConfig}
          onDeleteSocketConfig={onDeleteSocketConfig}
          onRenameRequest={onRenameRequest}
          onRenameSocketConfig={onRenameSocketConfig}
          sequenceDragMode={sequenceDragMode}
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
          canWrite={canWrite}
          onCreateEnvironment={onCreateEnvironment}
          onImportEnvironment={onImportEnvironment}
          onDeleteEnvironment={onDeleteEnvironment}
          onUpdateEnvironment={onUpdateEnvironment}
          onSetActive={onSetActiveEnvironment}
        />
      </TabsContent>

      <TabsContent value="invites" className="flex-1 m-0 overflow-y-auto">
        <InvitesPanel
          onAccepted={onInviteAccepted}
          updateWorkspace={onUpdateWorkspace}
          getWorkspace={getWorkspace}
        />
      </TabsContent>
    </Tabs>
  )
}
