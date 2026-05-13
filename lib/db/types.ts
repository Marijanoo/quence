// Database entity types for Postman Lite
// These types define the data structures stored in the database

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

export type BodyType = 'none' | 'json' | 'form-data' | 'x-www-form-urlencoded' | 'raw' | 'binary'

export type AuthType = 'none' | 'bearer' | 'basic' | 'api-key'

export interface KeyValuePair {
  id: string
  key: string
  value: string
  description?: string
  enabled: boolean
}

export interface AuthConfig {
  type: AuthType
  bearer?: {
    token: string
  }
  basic?: {
    username: string
    password: string
  }
  apiKey?: {
    key: string
    value: string
    addTo: 'header' | 'query'
  }
}

export interface RequestConfig {
  id: string
  name: string
  method: HttpMethod
  url: string
  params: KeyValuePair[]
  headers: KeyValuePair[]
  body: {
    type: BodyType
    content: string
    formData?: KeyValuePair[]
  }
  auth: AuthConfig
  collectionId?: string
  folderId?: string
  createdAt: number
  updatedAt: number
}

export interface Workspace {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

export interface Collection {
  id: string
  name: string
  description?: string
  folders: Folder[]
  workspaceId?: string
  createdAt: number
  updatedAt: number
}

export interface Folder {
  id: string
  name: string
  parentId?: string
}

export interface HistoryEntry {
  id: string
  request: RequestConfig
  response: ResponseData | null
  timestamp: number
  workspaceId?: string
}

export interface ResponseData {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  size: number
  time: number
  contentType: string
  isBinary: boolean
  url?: string
}

export interface Environment {
  id: string
  name: string
  variables: EnvironmentVariable[]
  isActive: boolean
  workspaceId?: string
  createdAt: number
  updatedAt: number
}

export interface EnvironmentVariable {
  id: string
  key: string
  value: string
  enabled: boolean
}

export interface WorkspaceTab {
  id: string
  requestId?: string // If saved to a collection
  request: RequestConfig
  response: ResponseData | null
  isDirty: boolean
}

export interface WorkspaceState {
  tabs: WorkspaceTab[]
  activeTabId: string | null
}

// Factory function to create a new request with defaults
export function createNewRequest(overrides?: Partial<RequestConfig>): RequestConfig {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    name: 'New Request',
    method: 'GET',
    url: '',
    params: [],
    headers: [],
    body: {
      type: 'none',
      content: '',
    },
    auth: {
      type: 'none',
    },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

// Factory function to create a new workspace
export function createNewWorkspace(name: string): Workspace {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
  }
}

// Factory function to create a new collection
export function createNewCollection(name: string, workspaceId?: string): Collection {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    name,
    workspaceId,
    folders: [],
    createdAt: now,
    updatedAt: now,
  }
}

// Factory function to create a new environment
export function createNewEnvironment(name: string, workspaceId?: string): Environment {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    name,
    variables: [],
    isActive: false,
    workspaceId,
    createdAt: now,
    updatedAt: now,
  }
}

// Factory function to create a new key-value pair
export function createKeyValuePair(key = '', value = ''): KeyValuePair {
  return {
    id: crypto.randomUUID(),
    key,
    value,
    enabled: true,
  }
}
