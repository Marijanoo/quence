// Database abstraction layer
// This file exports a database adapter that can be swapped out for different backends

import type {
  Workspace,
  Collection,
  RequestConfig,
  SocketConfig,
  HistoryEntry,
  Environment,
  WorkspaceState,
  Sequence,
} from './types'

// Database adapter interface - implement this for different backends
export interface DatabaseAdapter {
  // Initialization
  init(): Promise<void>

  // Workspaces
  getWorkspaces(): Promise<Workspace[]>
  createWorkspace(ws: Workspace): Promise<void>
  updateWorkspace(id: string, data: Partial<Workspace>): Promise<void>
  deleteWorkspace(id: string): Promise<void>

  // Collections (optionally filtered by workspace)
  getCollections(workspaceId?: string): Promise<Collection[]>
  getCollection(id: string): Promise<Collection | undefined>
  createCollection(collection: Collection): Promise<void>
  updateCollection(id: string, data: Partial<Collection>): Promise<void>
  deleteCollection(id: string): Promise<void>

  // Requests
  getRequests(collectionId?: string): Promise<RequestConfig[]>
  getRequest(id: string): Promise<RequestConfig | undefined>
  createRequest(request: RequestConfig): Promise<void>
  updateRequest(id: string, data: Partial<RequestConfig>): Promise<void>
  deleteRequest(id: string): Promise<void>

  // Socket configs
  getSocketConfigs(collectionId?: string): Promise<SocketConfig[]>
  createSocketConfig(config: SocketConfig): Promise<void>
  updateSocketConfig(id: string, data: Partial<SocketConfig>): Promise<void>
  deleteSocketConfig(id: string): Promise<void>

  // History (optionally filtered by workspace)
  getHistory(workspaceId?: string, limit?: number): Promise<HistoryEntry[]>
  addToHistory(entry: HistoryEntry): Promise<void>
  clearHistory(workspaceId?: string): Promise<void>
  deleteHistoryEntry(id: string): Promise<void>

  // Environments (optionally filtered by workspace)
  getEnvironments(workspaceId?: string): Promise<Environment[]>
  getEnvironment(id: string): Promise<Environment | undefined>
  createEnvironment(env: Environment): Promise<void>
  updateEnvironment(id: string, data: Partial<Environment>): Promise<void>
  deleteEnvironment(id: string): Promise<void>
  setActiveEnvironment(id: string | null, workspaceId?: string): Promise<void>

  // Sequences
  getSequences(collectionId?: string): Promise<Sequence[]>
  createSequence(seq: Sequence): Promise<void>
  updateSequence(id: string, data: Partial<Sequence>): Promise<void>
  deleteSequence(id: string): Promise<void>

  // Tab state per workspace
  getWorkspaceState(workspaceId: string): Promise<WorkspaceState | undefined>
  saveWorkspaceState(workspaceId: string, state: WorkspaceState): Promise<void>
}

// Singleton instance and initialization promise
let dbInstance: DatabaseAdapter | null = null
let dbInitPromise: Promise<DatabaseAdapter> | null = null

// Factory function to get the database instance
export async function getDatabase(): Promise<DatabaseAdapter> {
  if (dbInstance) return dbInstance
  if (dbInitPromise) return dbInitPromise

  dbInitPromise = (async () => {
    try {
      // Import IndexedDB adapter (can be swapped for other adapters)
      const { IndexedDBAdapter } = await import('./indexeddb-adapter')
      const adapter = new IndexedDBAdapter()
      await adapter.init()
      dbInstance = adapter
      return adapter
    } finally {
      dbInitPromise = null
    }
  })()

  return dbInitPromise
}

// Export for testing/mocking
export function setDatabaseInstance(adapter: DatabaseAdapter) {
  dbInstance = adapter
}

// Re-export types
export * from './types'
