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

export interface DatabaseAdapter {
  init(): Promise<void>

  getWorkspaces(): Promise<Workspace[]>
  createWorkspace(ws: Workspace): Promise<void>
  updateWorkspace(id: string, data: Partial<Workspace>): Promise<void>
  deleteWorkspace(id: string): Promise<void>

  getCollections(workspaceId?: string): Promise<Collection[]>
  getCollection(id: string): Promise<Collection | undefined>
  createCollection(collection: Collection): Promise<void>
  updateCollection(id: string, data: Partial<Collection>): Promise<void>
  deleteCollection(id: string): Promise<void>

  getRequests(collectionId?: string): Promise<RequestConfig[]>
  getRequest(id: string): Promise<RequestConfig | undefined>
  createRequest(request: RequestConfig): Promise<void>
  updateRequest(id: string, data: Partial<RequestConfig>): Promise<void>
  deleteRequest(id: string): Promise<void>

  getSocketConfigs(collectionId?: string): Promise<SocketConfig[]>
  createSocketConfig(config: SocketConfig): Promise<void>
  updateSocketConfig(id: string, data: Partial<SocketConfig>): Promise<void>
  deleteSocketConfig(id: string): Promise<void>

  getHistory(workspaceId?: string, limit?: number): Promise<HistoryEntry[]>
  addToHistory(entry: HistoryEntry): Promise<void>
  clearHistory(workspaceId?: string): Promise<void>
  deleteHistoryEntry(id: string): Promise<void>

  getEnvironments(workspaceId?: string): Promise<Environment[]>
  getEnvironment(id: string): Promise<Environment | undefined>
  createEnvironment(env: Environment): Promise<void>
  updateEnvironment(id: string, data: Partial<Environment>): Promise<void>
  deleteEnvironment(id: string): Promise<void>
  setActiveEnvironment(id: string | null, workspaceId?: string): Promise<void>

  getSequences(collectionId?: string): Promise<Sequence[]>
  createSequence(seq: Sequence): Promise<void>
  updateSequence(id: string, data: Partial<Sequence>): Promise<void>
  deleteSequence(id: string): Promise<void>

  getWorkspaceState(workspaceId: string): Promise<WorkspaceState | undefined>
  saveWorkspaceState(workspaceId: string, state: WorkspaceState): Promise<void>
}

let dbInstance: DatabaseAdapter | null = null
let dbInitPromise: Promise<DatabaseAdapter> | null = null

export async function getDatabase(userId?: string): Promise<DatabaseAdapter> {
  if (dbInstance) {
    // Update userId on the existing instance when provided
    if (userId && 'userId' in dbInstance) {
      (dbInstance as any).userId = userId
    }
    return dbInstance
  }
  if (dbInitPromise) return dbInitPromise

  dbInitPromise = (async () => {
    try {
      const { PostgresAdapter } = await import('./postgres-adapter')
      const adapter = new PostgresAdapter()
      if (userId) adapter.userId = userId
      await adapter.init()
      dbInstance = adapter
      return adapter
    } finally {
      dbInitPromise = null
    }
  })()

  return dbInitPromise
}

export function setDatabaseInstance(adapter: DatabaseAdapter) {
  dbInstance = adapter
}

export * from './types'
