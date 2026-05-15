'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import type { RequestConfig, ResponseData, HistoryEntry, Collection, SocketConfig, SocketTab, SocketMessage, SocketMessageType, SocketProtocol, Sequence, SequenceStepResult } from '@/lib/db/types'
import { createNewRequest, createNewSocketConfig } from '@/lib/db/types'
import { generateId } from '@/lib/utils'
import {
  useWorkspaceManager,
  useCollections,
  useRequests,
  useSocketConfigs,
  useSequences,
  useHistory,
  useEnvironments,
  useWorkspace,
} from '@/hooks/use-database'
import { parseVariables } from '@/lib/variable-parser'
import { splitUrl, searchToParams } from '@/lib/url-params'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Sidebar } from './sidebar'
import { TabBar } from './tab-bar'
import { RequestBuilder } from './request-builder'
import { ResponseViewer } from './response-viewer'
import { UrlBar } from './url-bar'
import { SocketBuilder } from './socket-builder'
import { SequenceBuilder } from './sequence-builder'
import { EnvironmentSelector } from './environment-selector'
import { EnvironmentProvider } from './environment-context'
import { TitleBar } from './title-bar'
import { SettingsPanel } from './settings-panel'
import { JwtDecoder } from './jwt-decoder-panel'
import { JsonFormatter } from './json-formatter-panel'
import { TextDiff } from './text-diff-panel'
import { WorkspaceDropdown } from './workspace-dropdown'
import { WorkspaceInviteDialog } from './workspace-invite-dialog'
import { WorkspaceQuickInviteDialog } from './workspace-quick-invite-dialog'
import { useAuth } from '@/lib/auth/auth-context'
import type { Workspace } from '@/lib/db/types'
import { Save, PanelBottom, PanelRight, Settings2, ListOrdered, Users, UserPlus, KeyRound, Braces, GitCompare } from 'lucide-react'

function friendlyNetworkError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('fetch failed') || m.includes('econnrefused') || m.includes('failed to fetch')) {
    return 'Connection refused — the server is not reachable. Check the URL and make sure the server is running.'
  }
  if (m.includes('enotfound') || m.includes('getaddrinfo')) {
    return 'Could not resolve host — check the URL and your network connection.'
  }
  if (m.includes('etimedout') || m.includes('timed out') || m.includes('timeout')) {
    return 'Request timed out — the server took too long to respond.'
  }
  if (m.includes('econnreset') || m.includes('connection reset')) {
    return 'Connection was reset by the server.'
  }
  if (m.includes('cert') || m.includes('ssl') || m.includes('tls')) {
    return `SSL/TLS error — ${message}`
  }
  if (m.includes('xhr post error') || m.includes('xhr poll error')) {
    return 'Connection failed — could not reach the server via polling. The server may be down or blocking the connection.'
  }
  if (m.includes('request interrupted by user') || m.includes('interrupted')) {
    return 'Connection interrupted.'
  }
  if (m.includes('websocket error') || m.includes('websocket connection failed')) {
    return 'WebSocket connection failed — check the URL and server.'
  }
  return message
}

function friendlySocketError(message: string): string {
  return friendlyNetworkError(message)
}

export function PostmanLite() {
  const { state: authState } = useAuth()
  const currentUser = authState.status === 'authenticated' ? authState.session.user : null

  const [isLoading, setIsLoading] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const requestGenerationRef = useRef(0)
  const activeElectronRequestIdRef = useRef<string | null>(null)
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false)
  const [isSaveSocketDialogOpen, setIsSaveSocketDialogOpen] = useState(false)
  const [saveSocketName, setSaveSocketName] = useState('')
  const [saveSocketCollectionId, setSaveSocketCollectionId] = useState<string>('')
  const [responseLayout, setResponseLayout] = useState<'side' | 'bottom'>('side')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [saveRequestName, setSaveRequestName] = useState('')
  const [saveCollectionId, setSaveCollectionId] = useState<string>('')
  const [pendingCloseTabId, setPendingCloseTabId] = useState<string | null>(null)
  const [isCloseConfirmOpen, setIsCloseConfirmOpen] = useState(false)
  const [inviteDialogWorkspace, setInviteDialogWorkspace] = useState<Workspace | null>(null)
  const [quickInviteWorkspace, setQuickInviteWorkspace] = useState<Workspace | null>(null)

  // Socket tab state (kept in memory only — not persisted to DB, connections are ephemeral)
  const [socketTabs, setSocketTabs] = useState<SocketTab[]>([])
  const [activeSocketTabId, setActiveSocketTabId] = useState<string | null>(null)
  // Map of tabId → WebSocket instance
  const socketRefs = useRef<Record<string, WebSocket>>({})

  const activeSocketTab = socketTabs.find(t => t.id === activeSocketTabId) ?? null

  // Per-tab active request panel (params/headers/body/auth)
  const [requestTabMap, setRequestTabMap] = useState<Record<string, string>>({})

  // Tool panel state (persisted across tab switches)
  const [jwtToken, setJwtToken] = useState('')
  const [jsonInput, setJsonInput] = useState('')
  const [diffText1, setDiffText1] = useState('')
  const [diffText2, setDiffText2] = useState('')

  // Sequence state
  const [activeView, setActiveView] = useState<'requests' | 'sequences' | 'jwt' | 'json' | 'diff'>('requests')
  const [runningSequenceId, setRunningSequenceId] = useState<string | null>(null)
  const [stepResults, setStepResults] = useState<Record<string, SequenceStepResult>>({})
  const sequenceAbortRef = useRef<boolean>(false)
  const sequenceControllerRef = useRef<AbortController | null>(null)
  const sequenceElectronRequestIdRef = useRef<string | null>(null)

  // Workspace manager
  const {
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    isLoading: workspaceManagerLoading,
    create: createWorkspaceRaw,
    rename: renameWorkspace,
    remove: removeWorkspace,
    switchTo: switchWorkspace,
    update: updateWorkspace,
  } = useWorkspaceManager()

  const createWorkspace = useCallback((name: string) => {
    return createWorkspaceRaw(name, currentUser ?? undefined)
  }, [createWorkspaceRaw, currentUser])

  // Permission: owner always has write; members need read-write; no workspace = write (local)
  const isOwner = !activeWorkspace
    || activeWorkspace.ownerId === currentUser?.id
    || activeWorkspace.ownerId === 'local'

  const canWrite = isOwner
    || activeWorkspace?.members.find(m => m.userId === currentUser?.id)?.permission === 'read-write'

  // Data hooks — all scoped to the active workspace
  const safeWorkspaceId = workspaceManagerLoading ? null : activeWorkspaceId
  const { collections, create: createCollection, update: updateCollection, remove: removeCollection, importCollection, reorder: reorderCollections } = useCollections(safeWorkspaceId)
  const { requests, create: createRequest, update: updateRequest, remove: removeRequest, refresh: refreshRequests, importRequests, reorderRequests } = useRequests()
  const { socketConfigs, create: createSocketConfig, update: dbUpdateSocketConfig, remove: removeSocketConfig, importSocketConfigs, refresh: refreshSocketConfigs } = useSocketConfigs()
  const { sequences, create: createSequence, update: updateSequence, remove: removeSequence } = useSequences()
  const { history, add: addToHistory, remove: removeHistoryEntry, clear: clearHistory } = useHistory(safeWorkspaceId)
  const { environments, activeEnvironment, create: createEnvironment, update: updateEnvironment, remove: removeEnvironment, setActive: setActiveEnvironment, importEnvironment } = useEnvironments(safeWorkspaceId)
  const {
    tabs,
    activeTab,
    activeTabId,
    isLoading: workspaceLoading,
    createTab,
    closeTab,
    setActiveTab,
    updateActiveRequest,
    setActiveResponse,
    markTabSaved,
    reorderTabs,
  } = useWorkspace(workspaceManagerLoading ? null : activeWorkspaceId)

  // Execute request
  const executeRequest = useCallback(async () => {
    if (!activeTab) return

    // Cancel any in-flight request before starting a new one
    abortControllerRef.current?.abort()
    if (activeElectronRequestIdRef.current && window.electronAPI?.cancelRequest) {
      window.electronAPI.cancelRequest(activeElectronRequestIdRef.current)
      activeElectronRequestIdRef.current = null
    }

    const generation = ++requestGenerationRef.current
    setIsLoading(true)
    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const request = activeTab.request
      const envVariables = activeEnvironment?.variables || []

      // Parse variables in URL
      let url = parseVariables(request.url, envVariables)

      // Add query params to URL
      const enabledParams = request.params.filter((p) => p.enabled && p.key)
      if (enabledParams.length > 0) {
        const params = new URLSearchParams()
        enabledParams.forEach((p) => {
          params.append(p.key, parseVariables(p.value, envVariables))
        })
        const separator = url.includes('?') ? '&' : '?'
        url = `${url}${separator}${params.toString()}`
      }

      // Build headers
      const headers: Record<string, string> = {}
      request.headers
        .filter((h) => h.enabled && h.key)
        .forEach((h) => {
          headers[parseVariables(h.key, envVariables)] = parseVariables(h.value, envVariables)
        })

      // Add auth headers
      if (request.auth.type === 'bearer' && request.auth.bearer?.token) {
        headers['Authorization'] = `Bearer ${parseVariables(request.auth.bearer.token, envVariables)}`
      } else if (request.auth.type === 'basic' && request.auth.basic) {
        const { username, password } = request.auth.basic
        const encoded = btoa(`${parseVariables(username, envVariables)}:${parseVariables(password, envVariables)}`)
        headers['Authorization'] = `Basic ${encoded}`
      } else if (request.auth.type === 'api-key' && request.auth.apiKey) {
        if (request.auth.apiKey.addTo === 'header') {
          headers[request.auth.apiKey.key] = parseVariables(request.auth.apiKey.value, envVariables)
        } else {
          const separator = url.includes('?') ? '&' : '?'
          url = `${url}${separator}${request.auth.apiKey.key}=${encodeURIComponent(parseVariables(request.auth.apiKey.value, envVariables))}`
        }
      }

      // Build body
      let requestBody: string | undefined
      let formDataEntries: { key: string; value: string; fileData?: { name: string; base64: string; mimeType: string } }[] | undefined
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
        if (request.body.type === 'json' || request.body.type === 'raw') {
          requestBody = parseVariables(request.body.content, envVariables)
          if (request.body.type === 'json' && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/json'
          }
        } else if (request.body.type === 'x-www-form-urlencoded') {
          const formData = request.body.formData?.filter((f) => f.enabled && f.key) || []
          const params = new URLSearchParams()
          formData.forEach((f) => params.append(f.key, parseVariables(f.value, envVariables)))
          requestBody = params.toString()
          headers['Content-Type'] = 'application/x-www-form-urlencoded'
        } else if (request.body.type === 'form-data') {
          const formData = request.body.formData?.filter((f) => f.enabled && f.key) || []
          formDataEntries = formData.map(f => ({
            key: parseVariables(f.key, envVariables),
            value: parseVariables(f.value, envVariables),
            fileData: f.fileData,
          }))
        }
      }

      let responseData: ResponseData;

      if (typeof window !== 'undefined' && window.electronAPI) {
        // Use Electron IPC — pass a requestId so the main process can abort it
        const requestId = generateId()
        activeElectronRequestIdRef.current = requestId
        const result = await window.electronAPI.makeRequest({
          url,
          method: request.method,
          headers,
          requestBody,
          requestId,
        })
        activeElectronRequestIdRef.current = null
        if (result?.aborted || generation !== requestGenerationRef.current) return
        responseData = result
      } else {
        // Make request through Next.js proxy
        const response = await fetch('/api/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url,
            method: request.method,
            headers,
            requestBody,
            formDataEntries,
          }),
          signal: controller.signal,
        })
        if (generation !== requestGenerationRef.current) return
        responseData = await response.json()
      }

      if (generation !== requestGenerationRef.current) return

      // Update tab with response
      await setActiveResponse(responseData)

      // Add to history
      const historyEntry: HistoryEntry = {
        id: generateId(),
        request: { ...request },
        response: responseData,
        timestamp: Date.now(),
        workspaceId: activeWorkspaceId ?? undefined,
      }
      await addToHistory(historyEntry)

    } catch (error) {
      if (generation !== requestGenerationRef.current) return
      if (error instanceof Error && error.name === 'AbortError') {
        setIsLoading(false)
        return
      }
      const raw = error instanceof Error ? error.message : 'Unknown error'
      const errorResponse: ResponseData = {
        status: 0,
        statusText: 'Network Error',
        headers: {},
        body: JSON.stringify({ error: friendlyNetworkError(raw) }, null, 2),
        size: 0,
        time: 0,
        contentType: 'application/json',
        isBinary: false,
      }
      await setActiveResponse(errorResponse)
    } finally {
      if (generation === requestGenerationRef.current) {
        abortControllerRef.current = null
        setIsLoading(false)
      }
    }
  }, [activeTab, activeEnvironment, setActiveResponse, addToHistory])

  const cancelRequest = useCallback(() => {
    requestGenerationRef.current++ // invalidate any in-flight response
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    if (activeElectronRequestIdRef.current && window.electronAPI?.cancelRequest) {
      window.electronAPI.cancelRequest(activeElectronRequestIdRef.current)
      activeElectronRequestIdRef.current = null
    }
    setIsLoading(false)
  }, [])

  // Standalone request runner used by sequences (does not touch tab state)
  const runSingleRequest = useCallback(async (request: RequestConfig, signal?: AbortSignal): Promise<ResponseData> => {
    const envVariables = activeEnvironment?.variables || []
    let url = parseVariables(request.url, envVariables)
    const enabledParams = request.params.filter(p => p.enabled && p.key)
    if (enabledParams.length > 0) {
      const params = new URLSearchParams()
      enabledParams.forEach(p => params.append(p.key, parseVariables(p.value, envVariables)))
      url += (url.includes('?') ? '&' : '?') + params.toString()
    }
    const headers: Record<string, string> = {}
    request.headers.filter(h => h.enabled && h.key).forEach(h => {
      headers[parseVariables(h.key, envVariables)] = parseVariables(h.value, envVariables)
    })
    if (request.auth.type === 'bearer' && request.auth.bearer?.token) {
      headers['Authorization'] = `Bearer ${parseVariables(request.auth.bearer.token, envVariables)}`
    } else if (request.auth.type === 'basic' && request.auth.basic) {
      const { username, password } = request.auth.basic
      headers['Authorization'] = `Basic ${btoa(`${parseVariables(username, envVariables)}:${parseVariables(password, envVariables)}`)}`
    } else if (request.auth.type === 'api-key' && request.auth.apiKey) {
      if (request.auth.apiKey.addTo === 'header') {
        headers[request.auth.apiKey.key] = parseVariables(request.auth.apiKey.value, envVariables)
      } else {
        url += (url.includes('?') ? '&' : '?') + `${request.auth.apiKey.key}=${encodeURIComponent(parseVariables(request.auth.apiKey.value, envVariables))}`
      }
    }
    let requestBody: string | undefined
    let formDataEntries: { key: string; value: string; fileData?: { name: string; base64: string; mimeType: string } }[] | undefined
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      if (request.body.type === 'json' || request.body.type === 'raw') {
        requestBody = parseVariables(request.body.content, envVariables)
        if (request.body.type === 'json' && !headers['Content-Type']) headers['Content-Type'] = 'application/json'
      } else if (request.body.type === 'x-www-form-urlencoded') {
        const fd = request.body.formData?.filter(f => f.enabled && f.key) || []
        const p = new URLSearchParams()
        fd.forEach(f => p.append(f.key, parseVariables(f.value, envVariables)))
        requestBody = p.toString()
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
      } else if (request.body.type === 'form-data') {
        formDataEntries = (request.body.formData?.filter(f => f.enabled && f.key) || []).map(f => ({
          key: parseVariables(f.key, envVariables),
          value: parseVariables(f.value, envVariables),
          fileData: f.fileData,
        }))
      }
    }
    if (typeof window !== 'undefined' && window.electronAPI) {
      const requestId = generateId()
      sequenceElectronRequestIdRef.current = requestId
      const result = await window.electronAPI.makeRequest({ url, method: request.method, headers, requestBody, requestId })
      sequenceElectronRequestIdRef.current = null
      if (result?.aborted || signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      return result
    }
    const res = await fetch('/api/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, method: request.method, headers, requestBody, formDataEntries }),
      signal,
    })
    return res.json()
  }, [activeEnvironment])

  const executeSequence = useCallback(async (seq: Sequence) => {
    setRunningSequenceId(seq.id)
    sequenceAbortRef.current = false
    const controller = new AbortController()
    sequenceControllerRef.current = controller
    const initialResults: Record<string, SequenceStepResult> = {}
    seq.steps.forEach(s => { initialResults[s.id] = { stepId: s.id, status: 'idle' } })
    setStepResults(initialResults)

    let lastResponseBody: string | null = null

    for (const step of seq.steps) {
      if (sequenceAbortRef.current || controller.signal.aborted) {
        setStepResults(prev => ({ ...prev, [step.id]: { stepId: step.id, status: 'skipped' } }))
        continue
      }
      setStepResults(prev => ({ ...prev, [step.id]: { stepId: step.id, status: 'running' } }))

      // ── Action step ──────────────────────────────────────────────────────
      if (step.type === 'action' && step.action) {
        const { type, jsonKey, envVariable } = step.action
        if (type === 'extract-json') {
          if (!lastResponseBody) {
            setStepResults(prev => ({ ...prev, [step.id]: { stepId: step.id, status: 'error', error: 'No previous response to extract from' } }))
            continue
          }
          try {
            const parsed = JSON.parse(lastResponseBody)
            // Support dot-notation: "data.access_token"
            const value = jsonKey.split('.').reduce((obj, key) => obj?.[key], parsed as Record<string, unknown>)
            if (value === undefined || value === null) {
              setStepResults(prev => ({ ...prev, [step.id]: { stepId: step.id, status: 'error', error: `Key "${jsonKey}" not found in response` } }))
              continue
            }
            const strValue = typeof value === 'string' ? value : JSON.stringify(value)
            // Write into active environment
            if (activeEnvironment) {
              const existing = activeEnvironment.variables.find(v => v.key === envVariable)
              const updatedVars = existing
                ? activeEnvironment.variables.map(v => v.key === envVariable ? { ...v, value: strValue } : v)
                : [...activeEnvironment.variables, { id: generateId(), key: envVariable, value: strValue, enabled: true }]
              await updateEnvironment(activeEnvironment.id, { variables: updatedVars })
            }
            setStepResults(prev => ({ ...prev, [step.id]: { stepId: step.id, status: 'success', extractedValue: strValue } }))
          } catch {
            setStepResults(prev => ({ ...prev, [step.id]: { stepId: step.id, status: 'error', error: 'Response is not valid JSON' } }))
          }
        }
        continue
      }

      // ── Request step ─────────────────────────────────────────────────────
      const fullRequest = requests.find(r => r.id === step.requestId)
      if (!fullRequest) {
        setStepResults(prev => ({ ...prev, [step.id]: { stepId: step.id, status: 'error', error: 'Request not found in collections' } }))
        continue
      }
      const start = Date.now()
      try {
        const response = await runSingleRequest(fullRequest, controller.signal)
        const duration = Date.now() - start
        if (controller.signal.aborted) {
          setStepResults(prev => ({ ...prev, [step.id]: { stepId: step.id, status: 'skipped' } }))
          continue
        }
        lastResponseBody = response.body
        const ok = response.status >= 200 && response.status < 300
        setStepResults(prev => ({
          ...prev,
          [step.id]: { stepId: step.id, status: ok ? 'success' : 'error', statusCode: response.status, statusText: response.statusText, duration, response },
        }))
      } catch (err) {
        const duration = Date.now() - start
        if (err instanceof Error && err.name === 'AbortError') {
          setStepResults(prev => ({ ...prev, [step.id]: { stepId: step.id, status: 'skipped' } }))
          continue
        }
        const msg = err instanceof Error ? err.message : 'Unknown error'
        lastResponseBody = null
        setStepResults(prev => ({ ...prev, [step.id]: { stepId: step.id, status: 'error', error: friendlyNetworkError(msg), duration } }))
      }
    }
    sequenceControllerRef.current = null
    setRunningSequenceId(null)
  }, [requests, runSingleRequest, activeEnvironment, updateEnvironment])

  const stopSequence = useCallback(() => {
    sequenceAbortRef.current = true
    sequenceControllerRef.current?.abort()
    sequenceControllerRef.current = null
    if (sequenceElectronRequestIdRef.current && window.electronAPI?.cancelRequest) {
      window.electronAPI.cancelRequest(sequenceElectronRequestIdRef.current)
      sequenceElectronRequestIdRef.current = null
    }
    setRunningSequenceId(null)
  }, [])

  // ── Socket tab management ──────────────────────────────────────────────────

  const createSocketTab = useCallback((config?: SocketConfig, protocol?: SocketProtocol) => {
    const resolved = config ?? createNewSocketConfig({ protocol: protocol ?? 'ws' })
    const tab: SocketTab = {
      id: generateId(),
      socketId: config?.id,
      config: resolved,
      messages: [],
      isDirty: false,
      connectionStatus: 'disconnected',
    }
    setSocketTabs(prev => [...prev, tab])
    setActiveSocketTabId(tab.id)
    // Deactivate HTTP tab
    setActiveTab('')
  }, [setActiveTab])

  const closeSocketTab = useCallback((tabId: string) => {
    // Disconnect if connected
    const ws = socketRefs.current[tabId]
    if (ws) { ws.close(); delete socketRefs.current[tabId] }
    setSocketTabs(prev => {
      const remaining = prev.filter(t => t.id !== tabId)
      if (activeSocketTabId === tabId) {
        // Switch to last socket tab or fall back to HTTP tabs
        if (remaining.length > 0) {
          setActiveSocketTabId(remaining[remaining.length - 1].id)
        } else {
          setActiveSocketTabId(null)
        }
      }
      return remaining
    })
  }, [activeSocketTabId])

  const updateSocketTab = useCallback((tabId: string, patch: Partial<SocketTab>) => {
    setSocketTabs(prev => prev.map(t => t.id === tabId ? { ...t, ...patch } : t))
  }, [])

  const updateSocketConfig = useCallback((tabId: string, updates: Partial<SocketTab['config']>) => {
    setSocketTabs(prev => prev.map(t =>
      t.id === tabId ? { ...t, config: { ...t.config, ...updates }, isDirty: true } : t
    ))
  }, [])

  // Register Electron IPC listeners once on mount, relay to socket tab state
  useEffect(() => {
    const api = window.electronAPI
    if (!api?.wsOnOpen) return

    api.wsOnOpen((socketId) => {
      updateSocketTab(socketId, { connectionStatus: 'connected' })
      setSocketTabs(prev => prev.map(t => {
        if (t.id !== socketId) return t
        const subs = t.config.events.filter(ev => ev.enabled && ev.name)
        if (subs.length === 0) return t
        const infoMsgs: SocketMessage[] = subs.map(ev => ({
          id: generateId(), direction: 'received' as const, type: 'text' as const,
          data: `Listening on "${ev.name}"`, timestamp: Date.now(), size: 0,
        }))
        return { ...t, messages: [...t.messages, ...infoMsgs] }
      }))
    })

    api.wsOnMessage((socketId, raw, isBinary) => {
      let data = raw
      let type: SocketMessageType = isBinary ? 'binary' : 'text'

      if (!isBinary) {
        try { JSON.parse(data); type = 'json' } catch { /* plain text */ }

        let event: string | undefined
        try {
          const parsed = JSON.parse(data)
          if (Array.isArray(parsed) && typeof parsed[0] === 'string') {
            event = parsed[0]
            data = parsed.length === 2
              ? (typeof parsed[1] === 'string' ? parsed[1] : JSON.stringify(parsed[1], null, 2))
              : JSON.stringify(parsed.slice(1), null, 2)
          }
        } catch { /* not Socket.IO */ }

        setSocketTabs(prev => {
          const tab = prev.find(t => t.id === socketId)
          const subscribedEvents = tab?.config.events.filter(ev => ev.enabled && ev.name)
          if (subscribedEvents && subscribedEvents.length > 0 && event && event !== '__ack__' && !subscribedEvents.some(ev => ev.name === event)) {
            return prev // filtered out
          }
          const msg: SocketMessage = {
            id: generateId(), direction: 'received', event, type,
            data, timestamp: Date.now(), size: new TextEncoder().encode(data).length,
          }
          return prev.map(t => t.id === socketId ? { ...t, messages: [...t.messages, msg] } : t)
        })
        return
      }

      const msg: SocketMessage = {
        id: generateId(), direction: 'received', type: 'binary',
        data, timestamp: Date.now(), size: data.length,
      }
      setSocketTabs(prev => prev.map(t => t.id === socketId ? { ...t, messages: [...t.messages, msg] } : t))
    })

    api.wsOnClose((socketId) => {
      updateSocketTab(socketId, { connectionStatus: 'disconnected' })
    })

    api.wsOnError((socketId, message) => {
      updateSocketTab(socketId, { connectionStatus: 'error' })
      const friendly = friendlySocketError(message)
      const msg: SocketMessage = {
        id: generateId(), direction: 'received', type: 'text',
        data: `Error: ${friendly}`, timestamp: Date.now(), size: friendly.length,
      }
      setSocketTabs(prev => prev.map(t => t.id === socketId ? { ...t, messages: [...t.messages, msg] } : t))
    })

    return () => { api.wsRemoveListeners() }
  }, [updateSocketTab])

  const buildSocketUrl = useCallback((tabId: string) => {
    const tab = socketTabs.find(t => t.id === tabId)
    if (!tab) return null
    const envVariables = activeEnvironment?.variables || []
    const protocol = tab.config.protocol ?? 'ws'
    let url = parseVariables(tab.config.url, envVariables)
    // Strip any /socket.io path users may have pasted by mistake
    const sioIdx = url.indexOf('/socket.io')
    if (sioIdx !== -1) url = url.slice(0, sioIdx)
    const enabledParams = tab.config.params.filter(p => p.enabled && p.key)
    if (enabledParams.length > 0) {
      const qs = new URLSearchParams()
      enabledParams.forEach(p => qs.append(parseVariables(p.key, envVariables), parseVariables(p.value, envVariables)))
      url += (url.includes('?') ? '&' : '?') + qs.toString()
    }
    if (protocol === 'socketio') {
      // socket.io-client wants http(s)://
      if (url.startsWith('wss://')) url = 'https://' + url.slice(6)
      else if (url.startsWith('ws://')) url = 'http://' + url.slice(5)
      else if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'http://' + url
    } else {
      // Raw WebSocket wants ws(s)://
      if (url.startsWith('https://')) url = 'wss://' + url.slice(8)
      else if (url.startsWith('http://')) url = 'ws://' + url.slice(7)
      else if (!url.startsWith('ws://') && !url.startsWith('wss://')) url = 'ws://' + url
    }
    return { url, tab, protocol }
  }, [socketTabs, activeEnvironment])

  const connectSocket = useCallback((tabId: string) => {
    const result = buildSocketUrl(tabId)
    if (!result) return
    const { url, tab, protocol } = result

    updateSocketTab(tabId, { connectionStatus: 'connecting', messages: [] })

    const envVariables = activeEnvironment?.variables || []
    const headers: Record<string, string> = {}
    tab.config.headers.filter(h => h.enabled && h.key).forEach(h => {
      headers[parseVariables(h.key, envVariables)] = parseVariables(h.value, envVariables)
    })

    if (window.electronAPI?.wsConnect) {
      // Electron: connect from main process (no browser restrictions)
      window.electronAPI.wsConnect(tabId, url, headers, protocol)
    } else {
      // Browser: route through the local WS proxy server
      try {
        const proxyBase = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws-proxy`
        const proxyUrl = `${proxyBase}?url=${encodeURIComponent(url)}&headers=${encodeURIComponent(JSON.stringify(headers))}&protocol=${protocol}`
        const ws = new WebSocket(proxyUrl)
        socketRefs.current[tabId] = ws

        ws.onmessage = (e) => {
          try {
            const envelope = JSON.parse(e.data)
            if (envelope.type === '__open') {
              updateSocketTab(tabId, { connectionStatus: 'connected' })
              setSocketTabs(prev => prev.map(t => {
                if (t.id !== tabId) return t
                const subs = t.config.events.filter(ev => ev.enabled && ev.name)
                if (subs.length === 0) return t
                const infoMsgs: SocketMessage[] = subs.map(ev => ({
                  id: generateId(), direction: 'received' as const, type: 'text' as const,
                  data: `Listening on "${ev.name}"`, timestamp: Date.now(), size: 0,
                }))
                return { ...t, messages: [...t.messages, ...infoMsgs] }
              }))
            } else if (envelope.type === '__close') {
              updateSocketTab(tabId, { connectionStatus: 'disconnected' })
              delete socketRefs.current[tabId]
            } else if (envelope.type === '__error') {
              updateSocketTab(tabId, { connectionStatus: 'error' })
              const friendly = friendlySocketError(envelope.message)
              const msg: SocketMessage = { id: generateId(), direction: 'received', type: 'text', data: `Error: ${friendly}`, timestamp: Date.now(), size: friendly.length }
              setSocketTabs(prev => prev.map(t => t.id === tabId ? { ...t, messages: [...t.messages, msg] } : t))
            } else if (envelope.type === '__message') {
              let data: string = envelope.data
              let type: SocketMessageType = envelope.isBinary ? 'binary' : 'text'
              let event: string | undefined
              if (!envelope.isBinary) {
                try { JSON.parse(data); type = 'json' } catch { /* */ }
                try {
                  const parsed = JSON.parse(data)
                  if (Array.isArray(parsed) && typeof parsed[0] === 'string') {
                    event = parsed[0]
                    data = parsed.length === 2 ? (typeof parsed[1] === 'string' ? parsed[1] : JSON.stringify(parsed[1], null, 2)) : JSON.stringify(parsed.slice(1), null, 2)
                    if (event === '__ack__') console.log('[socket] ACK received, data=', data)
                  }
                } catch { /* */ }
              }
              setSocketTabs(prev => {
                const t = prev.find(t => t.id === tabId)
                const subs = t?.config.events.filter(ev => ev.enabled && ev.name)
                if (subs && subs.length > 0 && event && event !== '__ack__' && !subs.some(ev => ev.name === event)) return prev
                const msg: SocketMessage = { id: generateId(), direction: 'received', event, type, data, timestamp: Date.now(), size: new TextEncoder().encode(data).length }
                return prev.map(t => t.id === tabId ? { ...t, messages: [...t.messages, msg] } : t)
              })
            }
          } catch { /* ignore malformed envelope */ }
        }
        ws.onerror = () => updateSocketTab(tabId, { connectionStatus: 'error' })
        ws.onclose = () => { updateSocketTab(tabId, { connectionStatus: 'disconnected' }); delete socketRefs.current[tabId] }
      } catch {
        updateSocketTab(tabId, { connectionStatus: 'error' })
      }
    }
  }, [buildSocketUrl, updateSocketTab, activeEnvironment])

  const disconnectSocket = useCallback((tabId: string) => {
    if (window.electronAPI?.wsDisconnect) {
      window.electronAPI.wsDisconnect(tabId)
    } else {
      const ws = socketRefs.current[tabId]
      if (ws) { ws.close(); delete socketRefs.current[tabId] }
    }
    updateSocketTab(tabId, { connectionStatus: 'disconnected' })
  }, [updateSocketTab])

  const sendSocketMessage = useCallback((tabId: string, event: string, data: string, type: SocketMessageType, ack = false) => {
    const envVariables = activeEnvironment?.variables || []
    const resolvedData = parseVariables(data, envVariables)
    // For ACK we send a special envelope so the server bridge knows to call emit with a callback
    const payload = ack
      ? JSON.stringify({ __ack: true, event, data: resolvedData })
      : (event && event !== 'message' ? JSON.stringify([event, resolvedData]) : resolvedData)
    if (ack) console.log('[socket] sending ACK payload', payload)

    if (window.electronAPI?.wsSend) {
      window.electronAPI.wsSend(tabId, payload)
    } else {
      const ws = socketRefs.current[tabId]
      if (!ws || ws.readyState !== WebSocket.OPEN) return
      ws.send(payload)
    }

    const msg: SocketMessage = {
      id: generateId(), direction: 'sent', event: event || undefined, type,
      data: resolvedData, timestamp: Date.now(), size: new TextEncoder().encode(resolvedData).length,
    }
    setSocketTabs(prev => prev.map(t => t.id === tabId ? { ...t, messages: [...t.messages, msg] } : t))
  }, [activeEnvironment])

  // Unified "select tab" — handles both HTTP and socket tabs
  const handleSelectTab = useCallback((id: string) => {
    const isSocket = socketTabs.some(t => t.id === id)
    if (isSocket) {
      setActiveSocketTabId(id)
      setActiveTab('')
    } else {
      setActiveSocketTabId(null)
      setActiveTab(id)
    }
  }, [socketTabs, setActiveTab])

  // Open saved socket config in a tab
  const openSocketConfig = useCallback((config: SocketConfig) => {
    const existing = socketTabs.find(t => t.socketId === config.id)
    if (existing) {
      setActiveSocketTabId(existing.id)
      setActiveTab('')
    } else {
      createSocketTab(config)
    }
  }, [socketTabs, createSocketTab, setActiveTab])

  // Open saved request in new tab, or switch to it if already open
  const openRequest = useCallback(async (request: RequestConfig) => {
    const existing = tabs.find(t => t.requestId === request.id)
    if (existing) {
      setActiveSocketTabId(null)
      await setActiveTab(existing.id)
    } else {
      setActiveSocketTabId(null)
      await createTab({ ...request }, request.id)
    }
    setActiveView('requests')
  }, [tabs, createTab, setActiveTab])

  // Open history entry in new tab
  const openHistoryEntry = useCallback(async (entry: HistoryEntry) => {
    const newRequest = createNewRequest({
      ...entry.request,
      id: generateId(), // New ID since it's not saved
    })
    await createTab(newRequest)
    setActiveView('requests')
    // Show the response from history
    if (entry.response) {
      // Need to wait for tab to be created, then set response
      setTimeout(async () => {
        await setActiveResponse(entry.response)
      }, 100)
    }
  }, [createTab, setActiveResponse])

  // Save current request to collection, then optionally close the tab
  const saveCurrentRequest = useCallback(async () => {
    const tabToSave = pendingCloseTabId
      ? tabs.find(t => t.id === pendingCloseTabId) ?? activeTab
      : activeTab
    if (!tabToSave || !saveCollectionId || !saveRequestName.trim()) return

    const request: RequestConfig = {
      ...tabToSave.request,
      name: saveRequestName.trim(),
      collectionId: saveCollectionId,
    }

    await createRequest(request)
    await markTabSaved(tabToSave.id, request.id)
    await refreshRequests()

    setSaveRequestName('')
    setSaveCollectionId('')
    setIsSaveDialogOpen(false)

    if (pendingCloseTabId) {
      await closeTab(pendingCloseTabId)
      setPendingCloseTabId(null)
      setIsCloseConfirmOpen(false)
    }
  }, [activeTab, tabs, pendingCloseTabId, saveCollectionId, saveRequestName, createRequest, markTabSaved, refreshRequests, closeTab])

  // Open save dialog (or save directly if already part of a collection)
  const openSaveDialog = useCallback(async () => {
    if (!activeTab) return
    if (activeTab.requestId) {
      await updateRequest(activeTab.requestId, { ...activeTab.request, updatedAt: Date.now() })
      await markTabSaved(activeTab.id, activeTab.requestId)
      await refreshRequests()
      return
    }
    setSaveRequestName(activeTab.request.name || 'New Request')
    setSaveCollectionId(collections[0]?.id || '')
    setIsSaveDialogOpen(true)
  }, [activeTab, collections, updateRequest, markTabSaved, refreshRequests])

  const saveCurrentSocket = useCallback(async () => {
    const tab = socketTabs.find(t => t.id === activeSocketTabId)
    if (!tab || !saveSocketCollectionId || !saveSocketName.trim()) return
    const config: SocketConfig = { ...tab.config, name: saveSocketName.trim(), collectionId: saveSocketCollectionId, updatedAt: Date.now() }
    console.log('[saveCurrentSocket] saving', config)
    try {
      if (tab.socketId) {
        await dbUpdateSocketConfig(tab.socketId, config)
      } else {
        await createSocketConfig(config)
        setSocketTabs(prev => prev.map(t => t.id === tab.id ? { ...t, socketId: config.id, isDirty: false } : t))
      }
      await refreshSocketConfigs()
      console.log('[saveCurrentSocket] done, refreshed')
    } catch (e) {
      console.error('[saveCurrentSocket] failed', e)
    }
    setIsSaveSocketDialogOpen(false)
  }, [socketTabs, activeSocketTabId, saveSocketName, saveSocketCollectionId, createSocketConfig, dbUpdateSocketConfig, refreshSocketConfigs])

  const openSaveSocketDialog = useCallback(() => {
    const tab = socketTabs.find(t => t.id === activeSocketTabId)
    if (!tab) return
    if (tab.socketId) {
      const config: SocketConfig = { ...tab.config, updatedAt: Date.now() }
      dbUpdateSocketConfig(tab.socketId, config).then(() => refreshSocketConfigs())
      setSocketTabs(prev => prev.map(t => t.id === tab.id ? { ...t, isDirty: false } : t))
      return
    }
    setSaveSocketName(tab.config.name || 'New Socket')
    setSaveSocketCollectionId(collections[0]?.id || '')
    setIsSaveSocketDialogOpen(true)
  }, [socketTabs, activeSocketTabId, collections, dbUpdateSocketConfig, refreshSocketConfigs])

  // Close tab — intercept dirty tabs to confirm
  const handleCloseTab = useCallback((tabId: string) => {
    const tab = tabs.find(t => t.id === tabId)
    if (tab?.isDirty) {
      setPendingCloseTabId(tabId)
      setSaveRequestName(tab.request.name || 'New Request')
      setSaveCollectionId(collections[0]?.id || '')
      setIsCloseConfirmOpen(true)
    } else {
      closeTab(tabId)
    }
  }, [tabs, collections, closeTab])

  // Unified "close tab" — after handleCloseTab so it's in scope
  const handleUnifiedCloseTab = useCallback((id: string) => {
    if (socketTabs.some(t => t.id === id)) {
      closeSocketTab(id)
    } else {
      handleCloseTab(id)
    }
  }, [socketTabs, closeSocketTab, handleCloseTab])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input field (except for saving)
      const isInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      
      if (e.ctrlKey && !e.altKey && !e.metaKey) {
        if (e.key.toLowerCase() === 's') {
          e.preventDefault();
          if (canWrite) { if (activeSocketTabId) openSaveSocketDialog(); else openSaveDialog(); }
        } else if (e.key.toLowerCase() === 't') {
          e.preventDefault();
          createTab();
        } else if (e.key.toLowerCase() === 'w') {
          e.preventDefault();
          const activeId = activeSocketTabId ?? activeTabId;
          if (activeId) {
            handleUnifiedCloseTab(activeId);
          }
        } else if (e.key === 'Enter') {
          e.preventDefault();
          executeRequest();
        } else if (e.key === 'Tab') {
          e.preventDefault();
          if (tabs.length > 1 && activeTabId) {
            const currentIndex = tabs.findIndex(t => t.id === activeTabId);
            if (currentIndex !== -1) {
              if (e.shiftKey) {
                // Previous tab
                const newIndex = currentIndex > 0 ? currentIndex - 1 : tabs.length - 1;
                setActiveTab(tabs[newIndex].id);
              } else {
                // Next tab
                const newIndex = currentIndex < tabs.length - 1 ? currentIndex + 1 : 0;
                setActiveTab(tabs[newIndex].id);
              }
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canWrite, activeTabId, activeSocketTabId, tabs, createTab, handleCloseTab, handleUnifiedCloseTab, setActiveTab, openSaveDialog, openSaveSocketDialog, executeRequest]);

  // Import collection handler (also receives socket configs from Postman imports)
  const handleImportCollection = useCallback(async (collection: Collection, importedRequests: RequestConfig[], socketConfigs?: SocketConfig[]) => {
    await importCollection(collection)
    await importRequests(importedRequests)
    if (socketConfigs && socketConfigs.length > 0) {
      await importSocketConfigs(socketConfigs)
    }
  }, [importCollection, importRequests, importSocketConfigs])

  // Workspace export
  const handleExportWorkspace = useCallback(async (workspaceId: string) => {
    const ws = workspaces.find(w => w.id === workspaceId)
    if (!ws) return
    const { getDatabase } = await import('@/lib/db')
    const db = await getDatabase()
    const wsCollections = await db.getCollections(workspaceId)
    const wsRequests: RequestConfig[] = []
    for (const col of wsCollections) {
      const reqs = await db.getRequests(col.id)
      wsRequests.push(...reqs)
    }
    const wsEnvironments = await db.getEnvironments(workspaceId)
    const payload = {
      version: 1,
      workspace: ws,
      collections: wsCollections,
      requests: wsRequests,
      environments: wsEnvironments,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${ws.name.replace(/[^a-z0-9]/gi, '_')}_workspace.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [workspaces])

  // Workspace import — triggered by hidden file input
  const workspaceImportRef = useRef<HTMLInputElement>(null)
  const handleImportWorkspaceFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    const failed: string[] = []
    for (const file of files) {
      try {
        const text = await file.text()
        const data = JSON.parse(text)
        if (data.version !== 1 || !data.workspace || !Array.isArray(data.collections)) {
          failed.push(file.name)
          continue
        }
        const { getDatabase } = await import('@/lib/db')
        const db = await getDatabase()
        // Create workspace with a new ID to avoid collisions
        const newWsId = generateId()
        const now = Date.now()
        await db.createWorkspace({ ...data.workspace, id: newWsId, name: `${data.workspace.name} (imported)`, createdAt: now, updatedAt: now })
        const idMap: Record<string, string> = {}
        for (const col of data.collections) {
          const newColId = generateId()
          idMap[col.id] = newColId
          await db.createCollection({ ...col, id: newColId, workspaceId: newWsId })
        }
        for (const req of (data.requests || [])) {
          const newReqId = generateId()
          const newColId = req.collectionId ? (idMap[req.collectionId] ?? req.collectionId) : undefined
          await db.createRequest({ ...req, id: newReqId, collectionId: newColId })
        }
        for (const env of (data.environments || [])) {
          await db.createEnvironment({ ...env, id: generateId(), workspaceId: newWsId, isActive: false })
        }
      } catch {
        failed.push(file.name)
      }
    }
    if (workspaceImportRef.current) workspaceImportRef.current.value = ''
    if (failed.length > 0) {
      alert(`Failed to import: ${failed.join(', ')}\n\nPlease ensure they are valid workspace export files.`)
    }
    // Refresh workspace list — reload page is simplest since hooks need to re-init
    window.location.reload()
  }, [])

  // Export all account data
  const handleExportAll = useCallback(async () => {
    const { getDatabase } = await import('@/lib/db')
    const db = await getDatabase()
    const allWorkspaces = await db.getWorkspaces()
    const allCollections = await db.getCollections()
    const allRequests: RequestConfig[] = []
    for (const col of allCollections) {
      const reqs = await db.getRequests(col.id)
      allRequests.push(...reqs)
    }
    const allEnvironments = await db.getEnvironments()
    const allSocketConfigs = await db.getSocketConfigs()
    const allSequences = await db.getSequences()
    const payload = {
      version: 2,
      exportedAt: Date.now(),
      workspaces: allWorkspaces,
      collections: allCollections,
      requests: allRequests,
      environments: allEnvironments,
      socketConfigs: allSocketConfigs,
      sequences: allSequences,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `postman-lite-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  // Import all account data
  const allDataImportRef = useRef<HTMLInputElement>(null)
  const handleImportAllFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (allDataImportRef.current) allDataImportRef.current.value = ''
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (data.version !== 2 || !Array.isArray(data.workspaces)) {
        alert('Invalid export file. Please use a file created by "Export All Data".')
        return
      }
      const { getDatabase } = await import('@/lib/db')
      const db = await getDatabase()
      // Map old IDs → new IDs to relink everything
      const wsIdMap: Record<string, string> = {}
      const colIdMap: Record<string, string> = {}
      const now = Date.now()
      for (const ws of data.workspaces) {
        const newId = generateId()
        wsIdMap[ws.id] = newId
        await db.createWorkspace({ ...ws, id: newId, name: `${ws.name} (imported)`, createdAt: now, updatedAt: now })
      }
      for (const col of (data.collections ?? [])) {
        const newId = generateId()
        colIdMap[col.id] = newId
        const newWsId = col.workspaceId ? (wsIdMap[col.workspaceId] ?? col.workspaceId) : undefined
        await db.createCollection({ ...col, id: newId, workspaceId: newWsId })
      }
      for (const req of (data.requests ?? [])) {
        const newColId = req.collectionId ? (colIdMap[req.collectionId] ?? req.collectionId) : undefined
        await db.createRequest({ ...req, id: generateId(), collectionId: newColId })
      }
      for (const env of (data.environments ?? [])) {
        const newWsId = env.workspaceId ? (wsIdMap[env.workspaceId] ?? env.workspaceId) : undefined
        await db.createEnvironment({ ...env, id: generateId(), workspaceId: newWsId, isActive: false })
      }
      for (const sc of (data.socketConfigs ?? [])) {
        const newColId = sc.collectionId ? (colIdMap[sc.collectionId] ?? sc.collectionId) : undefined
        await db.createSocketConfig({ ...sc, id: generateId(), collectionId: newColId })
      }
      for (const seq of (data.sequences ?? [])) {
        const newColId = seq.collectionId ? (colIdMap[seq.collectionId] ?? seq.collectionId) : undefined
        await db.createSequence({ ...seq, id: generateId(), collectionId: newColId })
      }
      window.location.reload()
    } catch {
      alert('Failed to import data. Please ensure the file is a valid export.')
    }
  }, [])

  if (workspaceManagerLoading || workspaceLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading workspace...</p>
        </div>
      </div>
    )
  }

  return (
    <EnvironmentProvider
      activeEnvironment={activeEnvironment}
      onUpdateEnvironment={updateEnvironment}
    >
      <div className="h-screen flex flex-col bg-background">
        <TitleBar />
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
        <WorkspaceDropdown
          workspaces={workspaces}
          activeWorkspace={activeWorkspace}
          onSelect={switchWorkspace}
          onCreate={createWorkspace}
          onRename={renameWorkspace}
          onDelete={removeWorkspace}
          onExport={handleExportWorkspace}
          onImport={() => workspaceImportRef.current?.click()}
          onExportAll={handleExportAll}
          onImportAll={() => allDataImportRef.current?.click()}
          onManageAccess={ws => setInviteDialogWorkspace(ws)}
          onUpdateWorkspace={updateWorkspace}
          getWorkspace={(id) => workspaces.find(w => w.id === id)}
        />
        <input
          ref={workspaceImportRef}
          type="file"
          accept=".json"
          multiple
          className="hidden"
          onChange={handleImportWorkspaceFile}
        />
        <input
          ref={allDataImportRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleImportAllFile}
        />
        <div className="flex items-center gap-2">
          <EnvironmentSelector
            environments={environments}
            activeEnvironment={activeEnvironment}
            onSelect={setActiveEnvironment}
          />
          {activeWorkspace && isOwner && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={() => setInviteDialogWorkspace(activeWorkspace)}
                title="Manage members"
              >
                <Users className="h-4 w-4" />
                {(activeWorkspace.members?.length ?? 0) > 0 && (
                  <span className="text-xs">{activeWorkspace.members.length}</span>
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={() => setQuickInviteWorkspace(activeWorkspace)}
              >
                <UserPlus className="h-4 w-4" />
                Invite
              </Button>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={activeSocketTabId ? openSaveSocketDialog : openSaveDialog}
            disabled={!canWrite || (!activeTab && !activeSocketTab)}
            title={!canWrite ? 'Read-only access' : undefined}
          >
            <Save className="h-4 w-4 mr-2" />
            Save
          </Button>
        </div>
      </header>

      {/* Main content */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Sidebar */}
        <ResizablePanel defaultSize={20} minSize={15} maxSize={35}>
          <Sidebar
            collections={collections}
            requests={requests}
            history={history}
            environments={environments}
            activeEnvironment={activeEnvironment}
            canWrite={canWrite}
            onCreateCollection={canWrite ? createCollection : () => {}}
            onDeleteCollection={canWrite ? removeCollection : () => {}}
            onRenameCollection={canWrite ? (id, name) => updateCollection(id, { name }) : () => {}}
            onReorderCollections={canWrite ? reorderCollections : () => {}}
            onReorderRequests={canWrite ? reorderRequests : () => {}}
            onMoveRequest={canWrite ? (requestId, targetCollectionId) => updateRequest(requestId, { collectionId: targetCollectionId }) : () => {}}
            onOpenRequest={openRequest}
            onDeleteRequest={canWrite ? removeRequest : () => {}}
            onSaveRequest={() => {}}
            onImportCollection={canWrite ? handleImportCollection : () => {}}
            socketConfigs={socketConfigs}
            onOpenSocketConfig={openSocketConfig}
            onDeleteSocketConfig={canWrite ? removeSocketConfig : () => {}}
            sequenceDragMode={activeView === 'sequences'}
            onOpenHistoryEntry={openHistoryEntry}
            onDeleteHistoryEntry={removeHistoryEntry}
            onClearHistory={clearHistory}
            onCreateEnvironment={canWrite ? createEnvironment : () => {}}
            onImportEnvironment={canWrite ? importEnvironment : () => {}}
            onDeleteEnvironment={canWrite ? removeEnvironment : () => {}}
            onUpdateEnvironment={canWrite ? updateEnvironment : () => {}}
            onSetActiveEnvironment={setActiveEnvironment}
            onInviteAccepted={(ws) => switchWorkspace(ws.id)}
            onUpdateWorkspace={updateWorkspace}
            getWorkspace={(id) => workspaces.find(w => w.id === id)}
          />
        </ResizablePanel>

        <ResizableHandle className="w-px bg-border" />

        {/* Request/Response area */}
        <ResizablePanel defaultSize={80}>
          <div className="flex flex-col h-full">

            {activeView === 'sequences' ? (
              <SequenceBuilder
                sequences={sequences}
                onCreateSequence={createSequence}
                onUpdateSequence={updateSequence}
                onDeleteSequence={removeSequence}
                onRunSequence={executeSequence}
                onStopSequence={stopSequence}
                runningSequenceId={runningSequenceId}
                stepResults={stepResults}
              />
            ) : activeView === 'jwt' ? (
              <JwtDecoder token={jwtToken} onTokenChange={setJwtToken} />
            ) : activeView === 'json' ? (
              <JsonFormatter input={jsonInput} onInputChange={setJsonInput} />
            ) : activeView === 'diff' ? (
              <TextDiff text1={diffText1} onText1Change={setDiffText1} text2={diffText2} onText2Change={setDiffText2} />
            ) : (
            <>
            {/* Tab bar */}
            <TabBar
              tabs={tabs}
              socketTabs={socketTabs}
              activeTabId={activeSocketTab ? activeSocketTabId : activeTabId}
              onSelectTab={handleSelectTab}
              onCloseTab={handleUnifiedCloseTab}
              onNewTab={() => { setActiveSocketTabId(null); createTab() }}
              onNewSocketTab={(protocol) => createSocketTab(undefined, protocol)}
              onReorderTabs={reorderTabs}
            />

            {/* Socket view (full panel, no split) */}
            {activeSocketTab ? (
              <div className="flex-1 min-h-0">
                <SocketBuilder
                  config={activeSocketTab.config}
                  messages={activeSocketTab.messages}
                  connectionStatus={activeSocketTab.connectionStatus}
                  onUpdate={(updates) => updateSocketConfig(activeSocketTab.id, updates)}
                  onConnect={() => connectSocket(activeSocketTab.id)}
                  onDisconnect={() => disconnectSocket(activeSocketTab.id)}
                  onSendMessage={(event, data, type, ack) => sendSocketMessage(activeSocketTab.id, event, data, type, ack)}
                  onClearMessages={() => updateSocketTab(activeSocketTab.id, { messages: [] })}
                  readOnly={!canWrite}
                />
              </div>
            ) : !activeTab ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground">
                <p className="text-sm">No open requests</p>
                <Button variant="outline" size="sm" onClick={() => { setActiveSocketTabId(null); createTab() }}>
                  New Request
                </Button>
              </div>
            ) : (
              <>
                {/* URL bar — spans full width above the split */}
                <UrlBar
                  request={activeTab.request}
                  onMethodChange={(method) => updateActiveRequest({ method })}
                  onUrlChange={(url) => {
                    const { search } = splitUrl(url)
                    const params = searchToParams(search, activeTab.request.params)
                    updateActiveRequest({ url, params })
                  }}
                  onCurlImport={updateActiveRequest}
                  onSend={executeRequest}
                  onCancel={cancelRequest}
                  isLoading={isLoading}
                  readOnly={!canWrite}
                />

                {/* Request tabs and response viewer split */}
                <ResizablePanelGroup
                  key={responseLayout}
                  direction={responseLayout === 'side' ? 'horizontal' : 'vertical'}
                  className="flex-1"
                >
                  <ResizablePanel defaultSize={50} minSize={30}>
                    <RequestBuilder
                      request={activeTab.request}
                      onUpdate={updateActiveRequest}
                      onSend={executeRequest}
                      isLoading={isLoading}
                      hideUrlBar
                      readOnly={!canWrite}
                      activeRequestTab={requestTabMap[activeTabId!] ?? 'params'}
                      onRequestTabChange={(tab) => setRequestTabMap(prev => ({ ...prev, [activeTabId!]: tab }))}
                    />
                  </ResizablePanel>

                  <ResizableHandle className={responseLayout === 'side' ? 'w-px bg-border' : 'h-px bg-border'} />

                  <ResizablePanel defaultSize={50} minSize={20}>
                    <ResponseViewer
                      response={activeTab?.response || null}
                      isLoading={isLoading}
                    />
                  </ResizablePanel>
                </ResizablePanelGroup>
              </>
            )}
            </>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Bottom bar */}
      <div className="flex items-center justify-between px-3 h-7 border-t border-border bg-card shrink-0">
        <button
          onClick={() => setIsSettingsOpen(o => !o)}
          title="Appearance settings"
          className={`flex items-center gap-1.5 px-2 h-5 rounded text-xs transition-colors ${
            isSettingsOpen
              ? 'text-foreground bg-accent/20'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent/20'
          }`}
        >
          <Settings2 className="h-3.5 w-3.5" />
          <span>Appearance</span>
        </button>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveView('requests')}
            title="Requests"
            className={`flex items-center gap-1.5 px-2 h-5 rounded text-xs transition-colors ${
              activeView === 'requests'
                ? 'text-foreground bg-accent/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/20'
            }`}
          >
            <PanelRight className="h-3.5 w-3.5" />
            <span>Requests</span>
          </button>
          <button
            onClick={() => setActiveView('sequences')}
            title="Sequences"
            className={`flex items-center gap-1.5 px-2 h-5 rounded text-xs transition-colors ${
              activeView === 'sequences'
                ? 'text-foreground bg-accent/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/20'
            }`}
          >
            <ListOrdered className="h-3.5 w-3.5" />
            <span>Sequences</span>
          </button>
          <button
            onClick={() => setActiveView('jwt')}
            title="JWT Decoder"
            className={`flex items-center gap-1.5 px-2 h-5 rounded text-xs transition-colors ${
              activeView === 'jwt'
                ? 'text-foreground bg-accent/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/20'
            }`}
          >
            <KeyRound className="h-3.5 w-3.5" />
            <span>JWT</span>
          </button>
          <button
            onClick={() => setActiveView('json')}
            title="JSON Formatter"
            className={`flex items-center gap-1.5 px-2 h-5 rounded text-xs transition-colors ${
              activeView === 'json'
                ? 'text-foreground bg-accent/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/20'
            }`}
          >
            <Braces className="h-3.5 w-3.5" />
            <span>JSON</span>
          </button>
          <button
            onClick={() => setActiveView('diff')}
            title="Text Compare"
            className={`flex items-center gap-1.5 px-2 h-5 rounded text-xs transition-colors ${
              activeView === 'diff'
                ? 'text-foreground bg-accent/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/20'
            }`}
          >
            <GitCompare className="h-3.5 w-3.5" />
            <span>Diff</span>
          </button>
          <button
            onClick={() => setResponseLayout(l => l === 'side' ? 'bottom' : 'side')}
            title={responseLayout === 'side' ? 'Move response to bottom' : 'Move response to side'}
            className="flex items-center gap-1.5 px-2 h-5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-accent/20 transition-colors"
          >
            {responseLayout === 'side'
              ? <PanelBottom className="h-3.5 w-3.5" />
              : <PanelRight className="h-3.5 w-3.5" />}
            <span>{responseLayout === 'side' ? 'Response to bottom' : 'Response to side'}</span>
          </button>
        </div>
      </div>

      <SettingsPanel open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      {inviteDialogWorkspace && (
        <WorkspaceInviteDialog
          open={!!inviteDialogWorkspace}
          onOpenChange={open => { if (!open) setInviteDialogWorkspace(null) }}
          workspace={inviteDialogWorkspace}
          onUpdateWorkspace={updateWorkspace}
        />
      )}

      {quickInviteWorkspace && (
        <WorkspaceQuickInviteDialog
          open={!!quickInviteWorkspace}
          onOpenChange={open => { if (!open) setQuickInviteWorkspace(null) }}
          workspace={quickInviteWorkspace}
          onUpdateWorkspace={updateWorkspace}
        />
      )}

      {/* Save Request Dialog */}
      <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Request Name</label>
              <Input
                value={saveRequestName}
                onChange={(e) => setSaveRequestName(e.target.value)}
                placeholder="Enter request name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Collection</label>
              {collections.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No collections yet. Create a collection first.
                </p>
              ) : (
                <Select value={saveCollectionId} onValueChange={setSaveCollectionId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a collection" />
                  </SelectTrigger>
                  <SelectContent>
                    {collections.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={saveCurrentRequest}
              disabled={!saveCollectionId || !saveRequestName.trim()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save Socket Dialog */}
      <Dialog open={isSaveSocketDialogOpen} onOpenChange={setIsSaveSocketDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Socket Connection</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                value={saveSocketName}
                onChange={(e) => setSaveSocketName(e.target.value)}
                placeholder="Enter connection name"
                onKeyDown={(e) => e.key === 'Enter' && saveCurrentSocket()}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Collection</label>
              {collections.length === 0 ? (
                <p className="text-sm text-muted-foreground">No collections yet. Create a collection first.</p>
              ) : (
                <Select value={saveSocketCollectionId} onValueChange={setSaveSocketCollectionId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a collection" />
                  </SelectTrigger>
                  <SelectContent>
                    {collections.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSaveSocketDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveCurrentSocket} disabled={!saveSocketCollectionId || !saveSocketName.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close confirmation dialog for unsaved tabs */}
      <Dialog
        open={isCloseConfirmOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsCloseConfirmOpen(false)
            setPendingCloseTabId(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unsaved changes</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This request has unsaved changes. Save it to a collection before closing, or discard the changes.
          </p>
          <div className="space-y-3 pt-1">
            <div className="space-y-2">
              <label className="text-sm font-medium">Request Name</label>
              <Input
                value={saveRequestName}
                onChange={(e) => setSaveRequestName(e.target.value)}
                placeholder="Enter request name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Collection</label>
              {collections.length === 0 ? (
                <p className="text-sm text-muted-foreground">No collections yet. Create a collection first.</p>
              ) : (
                <Select value={saveCollectionId} onValueChange={setSaveCollectionId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a collection" />
                  </SelectTrigger>
                  <SelectContent>
                    {collections.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsCloseConfirmOpen(false)
                setPendingCloseTabId(null)
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (pendingCloseTabId) {
                  await closeTab(pendingCloseTabId)
                  setPendingCloseTabId(null)
                  setIsCloseConfirmOpen(false)
                }
              }}
            >
              Discard
            </Button>
            <Button
              onClick={saveCurrentRequest}
              disabled={!saveCollectionId || !saveRequestName.trim()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </EnvironmentProvider>
  )
}
