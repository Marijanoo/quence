'use client'

import { useState, useEffect, useCallback } from 'react'
import type {
  Workspace,
  Collection,
  RequestConfig,
  SocketConfig,
  HistoryEntry,
  Environment,
  WorkspaceState,
  WorkspaceTab,
  ResponseData,
  Sequence,
} from '@/lib/db/types'
import {
  createNewRequest,
  createNewCollection,
  createNewEnvironment,
  createNewWorkspace,
} from '@/lib/db/types'
import { generateId } from '@/lib/utils'

const ACTIVE_WORKSPACE_KEY = 'postman-lite-active-workspace'

// Generic database hook (shared singleton)
function useDatabase() {
  const [db, setDb] = useState<import('@/lib/db').DatabaseAdapter | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function initDb() {
      const { getDatabase } = await import('@/lib/db')
      const database = await getDatabase()
      setDb(database)
      setIsLoading(false)
    }
    initDb()
  }, [])

  return { db, isLoading }
}

// Workspace manager — workspace list + active selection
export function useWorkspaceManager() {
  const { db, isLoading: dbLoading } = useDatabase()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(ACTIVE_WORKSPACE_KEY)
    }
    return null
  })
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!db) return []
    const data = await db.getWorkspaces()
    const sorted = data.sort((a, b) => a.createdAt - b.createdAt)
    setWorkspaces(sorted)
    return sorted
  }, [db])

  useEffect(() => {
    if (!db || dbLoading) return
    ;(async () => {
      const data = await refresh()

      if (data.length === 0) {
        // First run: create default workspace and migrate any v1 orphaned data
        const ws = createNewWorkspace('My Workspace')
        await db.createWorkspace(ws)

        const orphanCollections = await db.getCollections()
        for (const col of orphanCollections) {
          if (!col.workspaceId) await db.updateCollection(col.id, { workspaceId: ws.id })
        }
        const orphanEnvs = await db.getEnvironments()
        for (const env of orphanEnvs) {
          if (!env.workspaceId) await db.updateEnvironment(env.id, { workspaceId: ws.id })
        }
        // Migrate old tab state stored under 'default' key
        const oldState = await db.getWorkspaceState('default')
        if (oldState) await db.saveWorkspaceState(ws.id, oldState)

        setActiveWorkspaceId(ws.id)
        localStorage.setItem(ACTIVE_WORKSPACE_KEY, ws.id)
        await refresh()
      } else {
        const stored = localStorage.getItem(ACTIVE_WORKSPACE_KEY)
        if (!stored || !data.find(w => w.id === stored)) {
          setActiveWorkspaceId(data[0].id)
          localStorage.setItem(ACTIVE_WORKSPACE_KEY, data[0].id)
        }
      }
      setIsLoading(false)
    })()
  }, [db, dbLoading, refresh])

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId) ?? null

  const create = useCallback(async (name: string) => {
    if (!db) return
    const ws = createNewWorkspace(name)
    await db.createWorkspace(ws)
    await refresh()
    setActiveWorkspaceId(ws.id)
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, ws.id)
    return ws
  }, [db, refresh])

  const rename = useCallback(async (id: string, name: string) => {
    if (!db) return
    await db.updateWorkspace(id, { name })
    await refresh()
  }, [db, refresh])

  const remove = useCallback(async (id: string) => {
    if (!db) return
    await db.deleteWorkspace(id)
    const remaining = await refresh()
    if (id === activeWorkspaceId) {
      const next = remaining.find(w => w.id !== id) ?? remaining[0]
      if (next) {
        setActiveWorkspaceId(next.id)
        localStorage.setItem(ACTIVE_WORKSPACE_KEY, next.id)
      }
    }
  }, [db, refresh, activeWorkspaceId])

  const switchTo = useCallback((id: string) => {
    setActiveWorkspaceId(id)
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, id)
  }, [])

  return {
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    isLoading: isLoading || dbLoading,
    create,
    rename,
    remove,
    switchTo,
  }
}

// Collections hook
export function useCollections(workspaceId?: string | null) {
  const { db, isLoading: dbLoading } = useDatabase()
  const [collections, setCollections] = useState<Collection[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!db || !workspaceId) return
    const data = await db.getCollections(workspaceId)
    setCollections(data.sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt)))
  }, [db, workspaceId])

  useEffect(() => {
    if (db && !dbLoading && workspaceId) {
      setIsLoading(true)
      refresh().then(() => setIsLoading(false))
    }
  }, [db, dbLoading, refresh, workspaceId])

  const create = useCallback(async (name: string) => {
    if (!db || !workspaceId) return
    const collection = createNewCollection(name, workspaceId)
    await db.createCollection(collection)
    await refresh()
    return collection
  }, [db, refresh, workspaceId])

  const update = useCallback(async (id: string, data: Partial<Collection>) => {
    if (!db) return
    await db.updateCollection(id, data)
    await refresh()
  }, [db, refresh])

  const remove = useCallback(async (id: string) => {
    if (!db) return
    await db.deleteCollection(id)
    await refresh()
  }, [db, refresh])

  const importCollection = useCallback(async (collection: Collection) => {
    if (!db || !workspaceId) return
    await db.createCollection({ ...collection, workspaceId })
    await refresh()
  }, [db, refresh, workspaceId])

  const reorder = useCallback(async (ordered: Collection[]) => {
    if (!db) return
    for (let i = 0; i < ordered.length; i++) {
      await db.updateCollection(ordered[i].id, { order: i })
    }
    setCollections(ordered.map((c, i) => ({ ...c, order: i })))
  }, [db])

  return {
    collections,
    isLoading: isLoading || dbLoading,
    create,
    update,
    remove,
    importCollection,
    reorder,
    refresh,
  }
}

// Requests hook
export function useRequests(collectionId?: string) {
  const { db, isLoading: dbLoading } = useDatabase()
  const [requests, setRequests] = useState<RequestConfig[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!db) return
    const data = await db.getRequests(collectionId)
    setRequests(data.sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt)))
  }, [db, collectionId])

  useEffect(() => {
    if (db && !dbLoading) {
      refresh().then(() => setIsLoading(false))
    }
  }, [db, dbLoading, refresh])

  const create = useCallback(async (request: RequestConfig) => {
    if (!db) return
    await db.createRequest(request)
    await refresh()
  }, [db, refresh])

  const update = useCallback(async (id: string, data: Partial<RequestConfig>) => {
    if (!db) return
    await db.updateRequest(id, data)
    await refresh()
  }, [db, refresh])

  const remove = useCallback(async (id: string) => {
    if (!db) return
    await db.deleteRequest(id)
    await refresh()
  }, [db, refresh])

  const importRequests = useCallback(async (reqs: RequestConfig[]) => {
    if (!db) return
    for (const r of reqs) {
      await db.createRequest(r)
    }
    await refresh()
  }, [db, refresh])

  const reorderRequests = useCallback(async (ordered: RequestConfig[]) => {
    if (!db) return
    for (let i = 0; i < ordered.length; i++) {
      await db.updateRequest(ordered[i].id, { order: i })
    }
    await refresh()
  }, [db, refresh])

  return { requests, isLoading: isLoading || dbLoading, create, update, remove, importRequests, reorderRequests, refresh }
}

// Socket configs hook
export function useSocketConfigs() {
  const { db, isLoading: dbLoading } = useDatabase()
  const [socketConfigs, setSocketConfigs] = useState<SocketConfig[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!db) return
    const data = await db.getSocketConfigs()
    setSocketConfigs(data.sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt)))
  }, [db])

  useEffect(() => {
    if (db && !dbLoading) {
      refresh().then(() => setIsLoading(false))
    }
  }, [db, dbLoading, refresh])

  const create = useCallback(async (config: SocketConfig) => {
    if (!db) return
    await db.createSocketConfig(config)
    await refresh()
  }, [db, refresh])

  const update = useCallback(async (id: string, data: Partial<SocketConfig>) => {
    if (!db) return
    await db.updateSocketConfig(id, data)
    await refresh()
  }, [db, refresh])

  const remove = useCallback(async (id: string) => {
    if (!db) return
    await db.deleteSocketConfig(id)
    await refresh()
  }, [db, refresh])

  const importSocketConfigs = useCallback(async (configs: SocketConfig[]) => {
    if (!db) return
    for (const c of configs) await db.createSocketConfig(c)
    await refresh()
  }, [db, refresh])

  return { socketConfigs, isLoading: isLoading || dbLoading, create, update, remove, importSocketConfigs, refresh }
}

// Sequences hook
export function useSequences() {
  const { db, isLoading: dbLoading } = useDatabase()
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!db) return
    const data = await db.getSequences()
    setSequences(data.sort((a, b) => a.createdAt - b.createdAt))
  }, [db])

  useEffect(() => {
    if (db && !dbLoading) {
      refresh().then(() => setIsLoading(false))
    }
  }, [db, dbLoading, refresh])

  const create = useCallback(async (seq: Sequence) => {
    if (!db) return
    await db.createSequence(seq)
    await refresh()
  }, [db, refresh])

  const update = useCallback(async (id: string, data: Partial<Sequence>) => {
    if (!db) return
    await db.updateSequence(id, data)
    await refresh()
  }, [db, refresh])

  const remove = useCallback(async (id: string) => {
    if (!db) return
    await db.deleteSequence(id)
    await refresh()
  }, [db, refresh])

  return { sequences, isLoading: isLoading || dbLoading, create, update, remove, refresh }
}

// History hook
export function useHistory(workspaceId?: string | null, limit = 50) {
  const { db, isLoading: dbLoading } = useDatabase()
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!db) return
    const data = await db.getHistory(workspaceId ?? undefined, limit)
    setHistory(data)
  }, [db, workspaceId, limit])

  useEffect(() => {
    if (db && !dbLoading) {
      setIsLoading(true)
      refresh().then(() => setIsLoading(false))
    }
  }, [db, dbLoading, refresh])

  const add = useCallback(async (entry: HistoryEntry) => {
    if (!db) return
    await db.addToHistory(entry)
    await refresh()
  }, [db, refresh])

  const clear = useCallback(async () => {
    if (!db) return
    await db.clearHistory(workspaceId ?? undefined)
    await refresh()
  }, [db, refresh, workspaceId])

  const remove = useCallback(async (id: string) => {
    if (!db) return
    await db.deleteHistoryEntry(id)
    await refresh()
  }, [db, refresh])

  return { history, isLoading: isLoading || dbLoading, add, clear, remove, refresh }
}

// Environments hook
export function useEnvironments(workspaceId?: string | null) {
  const { db, isLoading: dbLoading } = useDatabase()
  const [environments, setEnvironments] = useState<Environment[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!db) return
    const data = await db.getEnvironments(workspaceId ?? undefined)
    setEnvironments(data.sort((a, b) => a.name.localeCompare(b.name)))
  }, [db, workspaceId])

  useEffect(() => {
    if (db && !dbLoading) {
      setIsLoading(true)
      refresh().then(() => setIsLoading(false))
    }
  }, [db, dbLoading, refresh])

  const activeEnvironment = environments.find(e => e.isActive)

  const create = useCallback(async (name: string) => {
    if (!db) return
    const env = createNewEnvironment(name, workspaceId ?? undefined)
    await db.createEnvironment(env)
    await refresh()
    return env
  }, [db, refresh, workspaceId])

  const update = useCallback(async (id: string, data: Partial<Environment>) => {
    if (!db) return
    await db.updateEnvironment(id, data)
    await refresh()
  }, [db, refresh])

  const remove = useCallback(async (id: string) => {
    if (!db) return
    await db.deleteEnvironment(id)
    await refresh()
  }, [db, refresh])

  const setActive = useCallback(async (id: string | null) => {
    if (!db) return
    await db.setActiveEnvironment(id, workspaceId ?? undefined)
    await refresh()
  }, [db, refresh, workspaceId])

  const importEnvironment = useCallback(async (env: Environment) => {
    if (!db) return
    await db.createEnvironment({ ...env, workspaceId: workspaceId ?? undefined })
    await refresh()
  }, [db, refresh, workspaceId])

  return {
    environments,
    activeEnvironment,
    isLoading: isLoading || dbLoading,
    create,
    update,
    remove,
    setActive,
    importEnvironment,
    refresh,
  }
}

// Tab-state hook scoped to a workspace
export function useWorkspace(workspaceId?: string | null) {
  const { db, isLoading: dbLoading } = useDatabase()
  const [state, setState] = useState<WorkspaceState>({ tabs: [], activeTabId: null })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!db || dbLoading || !workspaceId) return
    ;(async () => {
      setIsLoading(true)
      const saved = await db.getWorkspaceState(workspaceId)
      if (saved && saved.tabs.length > 0) {
        setState(saved)
      } else {
        const newTab: WorkspaceTab = {
          id: generateId(),
          request: createNewRequest(),
          response: null,
          isDirty: false,
        }
        const initialState = { tabs: [newTab], activeTabId: newTab.id }
        setState(initialState)
        await db.saveWorkspaceState(workspaceId, initialState)
      }
      setIsLoading(false)
    })()
  }, [db, dbLoading, workspaceId])

  const saveState = useCallback(async (newState: WorkspaceState) => {
    if (!db || !workspaceId) return
    setState(newState)
    await db.saveWorkspaceState(workspaceId, newState)
  }, [db, workspaceId])

  const activeTab = state.tabs.find(t => t.id === state.activeTabId)

  const createTab = useCallback(async (request?: RequestConfig, requestId?: string) => {
    const newTab: WorkspaceTab = {
      id: generateId(),
      requestId,
      request: request || createNewRequest(),
      response: null,
      isDirty: false,
    }
    await saveState({ tabs: [...state.tabs, newTab], activeTabId: newTab.id })
    return newTab
  }, [state.tabs, saveState])

  const closeTab = useCallback(async (tabId: string) => {
    const tabIndex = state.tabs.findIndex(t => t.id === tabId)
    const newTabs = state.tabs.filter(t => t.id !== tabId)
    let newActiveId = state.activeTabId
    if (state.activeTabId === tabId) {
      if (newTabs.length > 0) {
        newActiveId = newTabs[Math.min(tabIndex, newTabs.length - 1)].id
      } else {
        const newTab: WorkspaceTab = {
          id: generateId(),
          request: createNewRequest(),
          response: null,
          isDirty: false,
        }
        newTabs.push(newTab)
        newActiveId = newTab.id
      }
    }
    await saveState({ tabs: newTabs, activeTabId: newActiveId })
  }, [state, saveState])

  const setActiveTab = useCallback(async (tabId: string) => {
    await saveState({ ...state, activeTabId: tabId })
  }, [state, saveState])

  const updateTab = useCallback(async (tabId: string, updates: Partial<WorkspaceTab>) => {
    const newTabs = state.tabs.map(t => t.id === tabId ? { ...t, ...updates } : t)
    await saveState({ ...state, tabs: newTabs })
  }, [state, saveState])

  const updateActiveRequest = useCallback(async (updates: Partial<RequestConfig>) => {
    if (!activeTab) return
    await updateTab(activeTab.id, {
      request: { ...activeTab.request, ...updates, updatedAt: Date.now() },
      isDirty: true,
    })
  }, [activeTab, updateTab])

  const setActiveResponse = useCallback(async (response: ResponseData | null) => {
    if (!activeTab) return
    await updateTab(activeTab.id, { response })
  }, [activeTab, updateTab])

  const markTabSaved = useCallback(async (tabId: string, requestId: string) => {
    await updateTab(tabId, { requestId, isDirty: false })
  }, [updateTab])

  const reorderTabs = useCallback(async (reordered: WorkspaceTab[]) => {
    await saveState({ ...state, tabs: reordered })
  }, [state, saveState])

  return {
    tabs: state.tabs,
    activeTab,
    activeTabId: state.activeTabId,
    isLoading: isLoading || dbLoading,
    createTab,
    closeTab,
    setActiveTab,
    updateTab,
    updateActiveRequest,
    setActiveResponse,
    markTabSaved,
    reorderTabs,
  }
}
