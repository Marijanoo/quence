import type { DatabaseAdapter } from './index'
import type {
  Workspace, Collection, RequestConfig, SocketConfig,
  HistoryEntry, Environment, WorkspaceState, Sequence,
} from './types'

const db = () => window.electronAPI!.db

export class PostgresAdapter implements DatabaseAdapter {
  async init(): Promise<void> {
    // Connection is managed by the main process — nothing to do here
  }

  // Workspaces
  async getWorkspaces(): Promise<Workspace[]> {
    // userId is injected at call-site via getDatabase(userId) — stored on instance
    return db().workspaces.get(this.userId)
  }
  async createWorkspace(ws: Workspace): Promise<void> {
    await db().workspaces.create(ws)
  }
  async updateWorkspace(id: string, data: Partial<Workspace>): Promise<void> {
    await db().workspaces.update(id, data)
  }
  async deleteWorkspace(id: string): Promise<void> {
    await db().workspaces.delete(id)
  }

  // Collections
  async getCollections(workspaceId?: string): Promise<Collection[]> {
    return db().collections.get(workspaceId)
  }
  async getCollection(id: string): Promise<Collection | undefined> {
    return db().collections.getOne(id)
  }
  async createCollection(c: Collection): Promise<void> {
    await db().collections.create(c)
  }
  async updateCollection(id: string, data: Partial<Collection>): Promise<void> {
    await db().collections.update(id, data)
  }
  async deleteCollection(id: string): Promise<void> {
    await db().collections.delete(id)
  }

  // Requests
  async getRequests(collectionId?: string): Promise<RequestConfig[]> {
    return db().requests.get(collectionId)
  }
  async getRequest(id: string): Promise<RequestConfig | undefined> {
    return db().requests.getOne(id)
  }
  async createRequest(r: RequestConfig): Promise<void> {
    await db().requests.create(r)
  }
  async updateRequest(id: string, data: Partial<RequestConfig>): Promise<void> {
    await db().requests.update(id, data)
  }
  async deleteRequest(id: string): Promise<void> {
    await db().requests.delete(id)
  }

  // Socket configs
  async getSocketConfigs(collectionId?: string): Promise<SocketConfig[]> {
    return db().socketConfigs.get(collectionId)
  }
  async createSocketConfig(c: SocketConfig): Promise<void> {
    await db().socketConfigs.create(c)
  }
  async updateSocketConfig(id: string, data: Partial<SocketConfig>): Promise<void> {
    await db().socketConfigs.update(id, data)
  }
  async deleteSocketConfig(id: string): Promise<void> {
    await db().socketConfigs.delete(id)
  }

  // History
  async getHistory(workspaceId?: string, limit?: number): Promise<HistoryEntry[]> {
    return db().history.get(workspaceId, limit)
  }
  async addToHistory(entry: HistoryEntry): Promise<void> {
    await db().history.add(entry)
  }
  async clearHistory(workspaceId?: string): Promise<void> {
    await db().history.clear(workspaceId)
  }
  async deleteHistoryEntry(id: string): Promise<void> {
    await db().history.delete(id)
  }

  // Environments
  async getEnvironments(workspaceId?: string): Promise<Environment[]> {
    return db().environments.get(workspaceId)
  }
  async getEnvironment(id: string): Promise<Environment | undefined> {
    return db().environments.getOne(id)
  }
  async createEnvironment(env: Environment): Promise<void> {
    await db().environments.create(env)
  }
  async updateEnvironment(id: string, data: Partial<Environment>): Promise<void> {
    await db().environments.update(id, data)
  }
  async deleteEnvironment(id: string): Promise<void> {
    await db().environments.delete(id)
  }
  async setActiveEnvironment(id: string | null, workspaceId?: string): Promise<void> {
    await db().environments.setActive(id, workspaceId)
  }

  // Sequences
  async getSequences(collectionId?: string): Promise<Sequence[]> {
    return db().sequences.get(collectionId)
  }
  async createSequence(s: Sequence): Promise<void> {
    await db().sequences.create(s)
  }
  async updateSequence(id: string, data: Partial<Sequence>): Promise<void> {
    await db().sequences.update(id, data)
  }
  async deleteSequence(id: string): Promise<void> {
    await db().sequences.delete(id)
  }

  // Workspace state
  async getWorkspaceState(workspaceId: string): Promise<WorkspaceState | undefined> {
    return db().workspaceState.get(workspaceId)
  }
  async saveWorkspaceState(workspaceId: string, state: WorkspaceState): Promise<void> {
    await db().workspaceState.save(workspaceId, state)
  }

  userId: string = ''
}
