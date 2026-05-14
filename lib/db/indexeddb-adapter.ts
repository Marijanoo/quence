// IndexedDB implementation of the DatabaseAdapter interface

import { openDB, type IDBPDatabase } from 'idb'
import type { DatabaseAdapter } from './index'
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

const DB_NAME = 'postman-lite'
const DB_VERSION = 4

interface PostmanLiteDB {
  workspaces: Workspace
  collections: Collection
  requests: RequestConfig
  socketConfigs: SocketConfig
  sequences: Sequence
  history: HistoryEntry
  environments: Environment
  workspace: { id: string; state: WorkspaceState }
}

export class IndexedDBAdapter implements DatabaseAdapter {
  private db: IDBPDatabase<PostmanLiteDB> | null = null

  async init(): Promise<void> {
    this.db = await openDB<PostmanLiteDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('collections', { keyPath: 'id' })
          const requestStore = db.createObjectStore('requests', { keyPath: 'id' })
          requestStore.createIndex('collectionId', 'collectionId')
          const historyStore = db.createObjectStore('history', { keyPath: 'id' })
          historyStore.createIndex('timestamp', 'timestamp')
          db.createObjectStore('environments', { keyPath: 'id' })
          db.createObjectStore('workspace', { keyPath: 'id' })
        }
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains('workspaces')) {
            db.createObjectStore('workspaces', { keyPath: 'id' })
          }
        }
        if (oldVersion < 3) {
          if (!db.objectStoreNames.contains('socketConfigs')) {
            const socketStore = db.createObjectStore('socketConfigs', { keyPath: 'id' })
            socketStore.createIndex('collectionId', 'collectionId')
          }
        }
        if (oldVersion < 4) {
          if (!db.objectStoreNames.contains('sequences')) {
            const seqStore = db.createObjectStore('sequences', { keyPath: 'id' })
            seqStore.createIndex('collectionId', 'collectionId')
          }
        }
      },
    })
  }

  private getDb(): IDBPDatabase<PostmanLiteDB> {
    if (!this.db) throw new Error('Database not initialized. Call init() first.')
    return this.db
  }

  // Workspaces
  async getWorkspaces(): Promise<Workspace[]> {
    return this.getDb().getAll('workspaces')
  }

  async createWorkspace(ws: Workspace): Promise<void> {
    await this.getDb().put('workspaces', ws)
  }

  async updateWorkspace(id: string, data: Partial<Workspace>): Promise<void> {
    const db = this.getDb()
    const existing = await db.get('workspaces', id)
    if (existing) {
      await db.put('workspaces', { ...existing, ...data, updatedAt: Date.now() })
    }
  }

  async deleteWorkspace(id: string): Promise<void> {
    const db = this.getDb()
    // Cascade: delete all collections (which cascade to requests)
    const collections = await this.getCollections(id)
    for (const col of collections) {
      await this.deleteCollection(col.id)
    }
    // Cascade: delete all environments
    const envs = await this.getEnvironments(id)
    for (const env of envs) {
      await db.delete('environments', env.id)
    }
    // Cascade: delete history
    await this.clearHistory(id)
    // Delete tab state
    await db.delete('workspace', id)
    // Delete workspace record
    await db.delete('workspaces', id)
  }

  // Collections
  async getCollections(workspaceId?: string): Promise<Collection[]> {
    const all = await this.getDb().getAll('collections')
    if (!workspaceId) return all
    return all.filter(c => c.workspaceId === workspaceId)
  }

  async getCollection(id: string): Promise<Collection | undefined> {
    return this.getDb().get('collections', id)
  }

  async createCollection(collection: Collection): Promise<void> {
    await this.getDb().put('collections', collection)
  }

  async updateCollection(id: string, data: Partial<Collection>): Promise<void> {
    const db = this.getDb()
    const existing = await db.get('collections', id)
    if (existing) {
      await db.put('collections', { ...existing, ...data, updatedAt: Date.now() })
    }
  }

  async deleteCollection(id: string): Promise<void> {
    const db = this.getDb()
    const requests = await this.getRequests(id)
    for (const request of requests) {
      await db.delete('requests', request.id)
    }
    const sockets = await this.getSocketConfigs(id)
    for (const s of sockets) {
      await db.delete('socketConfigs', s.id)
    }
    const seqs = await this.getSequences(id)
    for (const s of seqs) {
      await db.delete('sequences', s.id)
    }
    await db.delete('collections', id)
  }

  // Requests
  async getRequests(collectionId?: string): Promise<RequestConfig[]> {
    const db = this.getDb()
    if (collectionId) {
      return db.getAllFromIndex('requests', 'collectionId', collectionId)
    }
    return db.getAll('requests')
  }

  async getRequest(id: string): Promise<RequestConfig | undefined> {
    return this.getDb().get('requests', id)
  }

  async createRequest(request: RequestConfig): Promise<void> {
    await this.getDb().put('requests', request)
  }

  async updateRequest(id: string, data: Partial<RequestConfig>): Promise<void> {
    const db = this.getDb()
    const existing = await db.get('requests', id)
    if (existing) {
      await db.put('requests', { ...existing, ...data, updatedAt: Date.now() })
    }
  }

  async deleteRequest(id: string): Promise<void> {
    await this.getDb().delete('requests', id)
  }

  // Socket configs
  async getSocketConfigs(collectionId?: string): Promise<SocketConfig[]> {
    const db = this.getDb()
    if (collectionId) {
      return db.getAllFromIndex('socketConfigs', 'collectionId', collectionId)
    }
    return db.getAll('socketConfigs')
  }

  async createSocketConfig(config: SocketConfig): Promise<void> {
    await this.getDb().put('socketConfigs', config)
  }

  async updateSocketConfig(id: string, data: Partial<SocketConfig>): Promise<void> {
    const db = this.getDb()
    const existing = await db.get('socketConfigs', id)
    if (existing) {
      await db.put('socketConfigs', { ...existing, ...data, updatedAt: Date.now() })
    }
  }

  async deleteSocketConfig(id: string): Promise<void> {
    await this.getDb().delete('socketConfigs', id)
  }

  // Sequences
  async getSequences(collectionId?: string): Promise<Sequence[]> {
    const db = this.getDb()
    if (collectionId) {
      return db.getAllFromIndex('sequences', 'collectionId', collectionId)
    }
    return db.getAll('sequences')
  }

  async createSequence(seq: Sequence): Promise<void> {
    await this.getDb().put('sequences', seq)
  }

  async updateSequence(id: string, data: Partial<Sequence>): Promise<void> {
    const db = this.getDb()
    const existing = await db.get('sequences', id)
    if (existing) {
      await db.put('sequences', { ...existing, ...data, updatedAt: Date.now() })
    }
  }

  async deleteSequence(id: string): Promise<void> {
    await this.getDb().delete('sequences', id)
  }

  // History
  async getHistory(workspaceId?: string, limit?: number): Promise<HistoryEntry[]> {
    const db = this.getDb()
    const all = await db.getAllFromIndex('history', 'timestamp')
    const sorted = all.sort((a, b) => b.timestamp - a.timestamp)
    const filtered = workspaceId ? sorted.filter(h => h.workspaceId === workspaceId) : sorted
    return limit ? filtered.slice(0, limit) : filtered
  }

  async addToHistory(entry: HistoryEntry): Promise<void> {
    const db = this.getDb()
    await db.put('history', entry)
    // Keep only last 100 entries per workspace (or globally if no workspaceId)
    const all = await this.getHistory(entry.workspaceId)
    if (all.length > 100) {
      for (const item of all.slice(100)) {
        await db.delete('history', item.id)
      }
    }
  }

  async clearHistory(workspaceId?: string): Promise<void> {
    const db = this.getDb()
    if (!workspaceId) {
      await db.clear('history')
      return
    }
    const entries = await this.getHistory(workspaceId)
    for (const entry of entries) {
      await db.delete('history', entry.id)
    }
  }

  async deleteHistoryEntry(id: string): Promise<void> {
    await this.getDb().delete('history', id)
  }

  // Environments
  async getEnvironments(workspaceId?: string): Promise<Environment[]> {
    const all = await this.getDb().getAll('environments')
    if (!workspaceId) return all
    return all.filter(e => e.workspaceId === workspaceId)
  }

  async getEnvironment(id: string): Promise<Environment | undefined> {
    return this.getDb().get('environments', id)
  }

  async createEnvironment(env: Environment): Promise<void> {
    await this.getDb().put('environments', env)
  }

  async updateEnvironment(id: string, data: Partial<Environment>): Promise<void> {
    const db = this.getDb()
    const existing = await db.get('environments', id)
    if (existing) {
      await db.put('environments', { ...existing, ...data, updatedAt: Date.now() })
    }
  }

  async deleteEnvironment(id: string): Promise<void> {
    await this.getDb().delete('environments', id)
  }

  async setActiveEnvironment(id: string | null, workspaceId?: string): Promise<void> {
    const db = this.getDb()
    const envs = await this.getEnvironments(workspaceId)
    for (const env of envs) {
      await db.put('environments', { ...env, isActive: env.id === id })
    }
  }

  // Tab state keyed by workspace ID
  async getWorkspaceState(workspaceId: string): Promise<WorkspaceState | undefined> {
    const record = await this.getDb().get('workspace', workspaceId)
    return record?.state
  }

  async saveWorkspaceState(workspaceId: string, state: WorkspaceState): Promise<void> {
    await this.getDb().put('workspace', { id: workspaceId, state })
  }
}
