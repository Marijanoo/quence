import type { DatabaseAdapter } from './index'
import type {
  Workspace, Collection, RequestConfig, SocketConfig,
  HistoryEntry, Environment, WorkspaceState, Sequence,
} from './types'

function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? 'https://quence.kolaj.fun'
}

function getToken(): string {
  try {
    const raw = localStorage.getItem('quence-session')
    if (raw) return JSON.parse(raw).token ?? ''
  } catch {}
  return ''
}

async function api<T>(method: string, path: string, body?: object): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any).error ?? `API error ${res.status}`)
  }
  return res.json() as Promise<T>
}

const get  = <T>(path: string)              => api<T>('GET',    path)
const post = <T>(path: string, body: object) => api<T>('POST',   path, body)
const patch = <T>(path: string, body: object) => api<T>('PATCH', path, body)
const del  = <T>(path: string)              => api<T>('DELETE', path)

export class RestAdapter implements DatabaseAdapter {
  userId: string = ''

  async init(): Promise<void> {}

  // Workspaces
  async getWorkspaces(): Promise<Workspace[]> {
    return get(`/workspaces`)
  }
  async createWorkspace(ws: Workspace): Promise<void> {
    await post(`/workspaces`, ws)
  }
  async updateWorkspace(id: string, data: Partial<Workspace>): Promise<void> {
    await patch(`/workspaces/${id}`, data)
  }
  async deleteWorkspace(id: string): Promise<void> {
    await del(`/workspaces/${id}`)
  }

  // Collections
  async getCollections(workspaceId?: string): Promise<Collection[]> {
    const qs = workspaceId ? `?workspaceId=${workspaceId}` : ''
    return get(`/collections${qs}`)
  }
  async getCollection(id: string): Promise<Collection | undefined> {
    return get(`/collections/${id}`)
  }
  async createCollection(c: Collection): Promise<void> {
    await post(`/collections`, c)
  }
  async updateCollection(id: string, data: Partial<Collection>): Promise<void> {
    await patch(`/collections/${id}`, data)
  }
  async deleteCollection(id: string): Promise<void> {
    await del(`/collections/${id}`)
  }

  // Requests
  async getRequests(collectionId?: string): Promise<RequestConfig[]> {
    const qs = collectionId ? `?collectionId=${collectionId}` : ''
    return get(`/requests${qs}`)
  }
  async getRequest(id: string): Promise<RequestConfig | undefined> {
    return get<RequestConfig>(`/requests/${id}`).catch(() => undefined)
  }
  async createRequest(r: RequestConfig): Promise<void> {
    await post(`/requests`, r)
  }
  async updateRequest(id: string, data: Partial<RequestConfig>): Promise<void> {
    await patch(`/requests/${id}`, data)
  }
  async deleteRequest(id: string): Promise<void> {
    await del(`/requests/${id}`)
  }

  // Socket configs
  async getSocketConfigs(collectionId?: string): Promise<SocketConfig[]> {
    const qs = collectionId ? `?collectionId=${collectionId}` : ''
    return get(`/sockets${qs}`)
  }
  async createSocketConfig(c: SocketConfig): Promise<void> {
    await post(`/sockets`, c)
  }
  async updateSocketConfig(id: string, data: Partial<SocketConfig>): Promise<void> {
    await patch(`/sockets/${id}`, data)
  }
  async deleteSocketConfig(id: string): Promise<void> {
    await del(`/sockets/${id}`)
  }

  // History
  async getHistory(workspaceId?: string, limit?: number): Promise<HistoryEntry[]> {
    const params = new URLSearchParams()
    if (workspaceId) params.set('workspaceId', workspaceId)
    if (limit)       params.set('limit', String(limit))
    const qs = params.toString() ? `?${params}` : ''
    return get(`/history${qs}`)
  }
  async addToHistory(entry: HistoryEntry): Promise<void> {
    await post(`/history`, entry)
  }
  async clearHistory(workspaceId?: string): Promise<void> {
    const qs = workspaceId ? `?workspaceId=${workspaceId}` : ''
    await del(`/history${qs}`)
  }
  async deleteHistoryEntry(id: string): Promise<void> {
    await del(`/history/${id}`)
  }

  // Environments
  async getEnvironments(workspaceId?: string): Promise<Environment[]> {
    const qs = workspaceId ? `?workspaceId=${workspaceId}` : ''
    return get(`/environments${qs}`)
  }
  async getEnvironment(id: string): Promise<Environment | undefined> {
    return get(`/environments/${id}`)
  }
  async createEnvironment(env: Environment): Promise<void> {
    await post(`/environments`, env)
  }
  async updateEnvironment(id: string, data: Partial<Environment>): Promise<void> {
    await patch(`/environments/${id}`, data)
  }
  async deleteEnvironment(id: string): Promise<void> {
    await del(`/environments/${id}`)
  }
  async setActiveEnvironment(id: string | null, workspaceId?: string): Promise<void> {
    await post(`/environments/active`, { id, workspaceId })
  }

  // Sequences
  async getSequences(workspaceId?: string): Promise<Sequence[]> {
    const qs = workspaceId ? `?workspaceId=${workspaceId}` : ''
    return get(`/sequences${qs}`)
  }
  async createSequence(s: Sequence): Promise<void> {
    await post(`/sequences`, s)
  }
  async updateSequence(id: string, data: Partial<Sequence>): Promise<void> {
    await patch(`/sequences/${id}`, data)
  }
  async deleteSequence(id: string): Promise<void> {
    await del(`/sequences/${id}`)
  }

  // Workspace state
  async getWorkspaceState(workspaceId: string): Promise<WorkspaceState | undefined> {
    return get(`/state/${workspaceId}`)
  }
  async saveWorkspaceState(workspaceId: string, state: WorkspaceState): Promise<void> {
    await api('PUT', `/state/${workspaceId}`, state)
  }
}
