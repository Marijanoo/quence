// Database entity types for Quence
// These types define the data structures stored in the database

import { generateId } from '@/lib/utils'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

export type BodyType = 'none' | 'json' | 'form-data' | 'x-www-form-urlencoded' | 'raw' | 'binary'

export type AuthType = 'none' | 'bearer' | 'basic' | 'api-key'

// ── Socket.IO / WebSocket types ──────────────────────────────────────────────

export type SocketMessageType = 'text' | 'json' | 'binary'

export interface SocketEvent {
  id: string
  name: string
  enabled: boolean
}

export interface SocketMessage {
  id: string
  direction: 'sent' | 'received'
  event?: string
  type: SocketMessageType
  data: string
  timestamp: number
  size: number
}

export type SocketProtocol = 'ws' | 'socketio'

export interface SocketConfig {
  id: string
  name: string
  url: string
  protocol: SocketProtocol
  params: KeyValuePair[]
  headers: KeyValuePair[]
  auth: AuthConfig
  events: SocketEvent[]
  // Message composer state (persisted so it survives tab switches)
  messageType: SocketMessageType
  messageEvent: string
  messageContent: string
  collectionId?: string
  folderId?: string
  order?: number
  createdAt: number
  updatedAt: number
}

export interface SocketTab {
  id: string
  socketId?: string // If saved to a collection
  config: SocketConfig
  messages: SocketMessage[]
  isDirty: boolean
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error'
  serverUpdatedAt?: number
}

export interface KeyValuePair {
  id: string
  key: string
  value: string
  description?: string
  enabled: boolean
  type?: 'text' | 'file'
  fileData?: { name: string; base64: string; mimeType: string }
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
  order?: number
  createdAt: number
  updatedAt: number
}

export type WorkspacePermission = 'read' | 'read-write'

export interface WorkspaceMember {
  userId: string
  email: string
  name: string
  permission: WorkspacePermission
  joinedAt: number
}

export interface WorkspaceInvite {
  id: string
  workspaceId: string
  workspaceName: string
  ownerEmail: string
  ownerName: string
  inviteeEmail: string
  permission: WorkspacePermission
  createdAt: number
}

export interface Workspace {
  id: string
  name: string
  ownerId: string
  ownerName: string
  ownerEmail: string
  members: WorkspaceMember[]
  isSynced?: boolean
  createdAt: number
  updatedAt: number
}

export interface Collection {
  id: string
  name: string
  description?: string
  folders: Folder[]
  workspaceId?: string
  order?: number
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
  savedRequest?: RequestConfig // Snapshot at last save — used to detect real changes
  serverUpdatedAt?: number // updatedAt from server when last loaded/saved — used for conflict detection
  response: ResponseData | null
  isDirty: boolean
  isHistorical?: boolean // Opened from history — snapshot, cannot send
  historyTimestamp?: number
}

export interface WorkspaceState {
  tabs: WorkspaceTab[]
  activeTabId: string | null
  socketTabs?: SocketTab[]
  activeSocketTabId?: string | null
  tabOrder?: { id: string; kind: 'http' | 'socket' }[]
}

// Factory function to create a new request with defaults
export function createNewRequest(overrides?: Partial<RequestConfig>): RequestConfig {
  const now = Date.now()
  return {
    id: generateId(),
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
export function createNewWorkspace(name: string, owner?: { id: string; name: string; email: string }): Workspace {
  const now = Date.now()
  return {
    id: generateId(),
    name,
    ownerId: owner?.id ?? 'local',
    ownerName: owner?.name ?? 'Me',
    ownerEmail: owner?.email ?? '',
    members: [],
    createdAt: now,
    updatedAt: now,
  }
}

// Factory function to create a new collection
export function createNewCollection(name: string, workspaceId?: string): Collection {
  const now = Date.now()
  return {
    id: generateId(),
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
    id: generateId(),
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
    id: generateId(),
    key,
    value,
    enabled: true,
  }
}

// ── Sequence types ────────────────────────────────────────────────────────────

export type SequenceStepStatus = 'idle' | 'running' | 'success' | 'error' | 'skipped'

export type SequenceActionType = 'extract-json' | 'repeat'

export interface SequenceAction {
  type: SequenceActionType
  jsonKey?: string      // extract-json: dot-notation path e.g. "data.access_token"
  envVariable?: string  // extract-json: environment variable key to write into
  repeatCount?: number  // repeat: number of times to repeat the previous request
}

export interface SequenceStep {
  id: string
  type: 'request' | 'action' | 'sequence'
  // request step fields
  requestId?: string
  name: string
  method?: HttpMethod
  url?: string
  // action step fields
  action?: SequenceAction
  // sequence step fields
  sequenceId?: string
  order: number
}

export interface SequenceStepResult {
  stepId: string
  status: SequenceStepStatus
  statusCode?: number
  statusText?: string
  duration?: number
  error?: string
  extractedValue?: string  // for extract-json actions
  response?: ResponseData  // full response for request steps
  subResults?: Record<string, SequenceStepResult>  // for sub-sequence steps
  iterations?: SequenceStepResult[] // for repeat action steps
}

export interface Sequence {
  id: string
  name: string
  workspaceId?: string
  collectionId?: string
  steps: SequenceStep[]
  createdAt: number
  updatedAt: number
}

export function createNewSequence(overrides?: Partial<Sequence>): Sequence {
  const now = Date.now()
  return {
    id: generateId(),
    name: 'New Sequence',
    steps: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

// Factory function to create a new socket config
export function createNewSocketConfig(overrides?: Partial<SocketConfig>): SocketConfig {
  const now = Date.now()
  return {
    id: generateId(),
    name: 'New Socket',
    url: '',
    protocol: 'ws',
    params: [],
    headers: [],
    auth: { type: 'none' },
    events: [],
    messageType: 'text',
    messageEvent: 'message',
    messageContent: '',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}
