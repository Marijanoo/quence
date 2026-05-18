'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import type { Collection, RequestConfig, SocketConfig, HttpMethod, KeyValuePair, AuthConfig, BodyType } from '@/lib/db/types'
import { createNewSocketConfig } from '@/lib/db/types'
import { cn, generateId } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  FolderOpen,
  ChevronRight,
  MoreHorizontal,
  Plus,
  Trash2,
  Pencil,
  Upload,
  Download,
  GripVertical,
  Search,
  X,
} from 'lucide-react'

interface CollectionsPanelProps {
  collections: Collection[]
  requests: RequestConfig[]
  socketConfigs?: SocketConfig[]
  canWrite?: boolean
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
  onOpenSocketConfig?: (config: SocketConfig) => void
  onDeleteSocketConfig?: (id: string) => void
  onRenameRequest?: (id: string, name: string) => void
  onRenameSocketConfig?: (id: string, name: string) => void
  sequenceDragMode?: boolean
}

const methodColors: Record<HttpMethod, string> = {
  GET: 'text-[oklch(0.88_0.15_140)]',
  POST: 'text-[oklch(0.88_0.14_75)]',
  PUT: 'text-[oklch(0.88_0.13_240)]',
  PATCH: 'text-[oklch(0.88_0.13_300)]',
  DELETE: 'text-[oklch(0.88_0.14_15)]',
  HEAD: 'text-[oklch(0.88_0.11_195)]',
  OPTIONS: 'text-muted-foreground',
}

export function CollectionsPanel({
  collections,
  requests,
  socketConfigs = [],
  canWrite = true,
  onCreateCollection,
  onDeleteCollection,
  onRenameCollection,
  onReorderCollections,
  onReorderRequests,
  onMoveRequest,
  onOpenRequest,
  onDeleteRequest,
  onImportCollection,
  onOpenSocketConfig,
  onDeleteSocketConfig,
  onRenameRequest,
  onRenameSocketConfig,
  sequenceDragMode = false,
}: CollectionsPanelProps) {
  const [expandedCollections, setExpandedCollections] = useState<Set<string>>(new Set())
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false)
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null)
  const [renameTarget, setRenameTarget] = useState<{ type: 'request' | 'socket'; id: string } | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [pendingDeleteRequestId, setPendingDeleteRequestId] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const q = searchQuery.trim().toLowerCase()
  const isSearching = q.length > 0

  const matchesSearch = useCallback((r: RequestConfig) =>
    r.name.toLowerCase().includes(q) ||
    r.url.toLowerCase().includes(q) ||
    r.method.toLowerCase().includes(q),
  [q])

  // ── Drag state ────────────────────────────────────────────────────────────
  const [dragCollectionId, setDragCollectionId] = useState<string | null>(null)
  const [dragOverCollectionId, setDragOverCollectionId] = useState<string | null>(null)
  const [dragRequestId, setDragRequestId] = useState<string | null>(null)
  const [dragOverRequestId, setDragOverRequestId] = useState<string | null>(null)
  // highlight on a collection header when dragging a request over it
  const [dragRequestOverCollectionId, setDragRequestOverCollectionId] = useState<string | null>(null)
  // which collection the dragged request belongs to
  const dragRequestCollectionId = useRef<string | null>(null)

  const clearRequestDragState = useCallback(() => {
    setDragRequestId(null)
    setDragOverRequestId(null)
    setDragRequestOverCollectionId(null)
    dragRequestCollectionId.current = null
  }, [])

  const handleCollectionDragStart = useCallback((e: React.DragEvent, id: string) => {
    setDragCollectionId(id)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleCollectionDragOver = useCallback((e: React.DragEvent, id: string) => {
    // Only handle collection reordering when dragging a collection (not a request)
    if (dragRequestId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverCollectionId(id)
  }, [dragRequestId])

  const handleCollectionDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    e.stopPropagation()

    // Request dropped onto a collection header → move to that collection
    if (dragRequestId) {
      const sourceCollectionId = dragRequestCollectionId.current
      if (sourceCollectionId !== targetId) {
        onMoveRequest(dragRequestId, targetId)
      }
      clearRequestDragState()
      setDragOverCollectionId(null)
      return
    }

    // Collection reorder
    if (!dragCollectionId || dragCollectionId === targetId) {
      setDragCollectionId(null)
      setDragOverCollectionId(null)
      return
    }
    const from = collections.findIndex(c => c.id === dragCollectionId)
    const to = collections.findIndex(c => c.id === targetId)
    if (from === -1 || to === -1) return
    const reordered = [...collections]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(to, 0, moved)
    onReorderCollections(reordered)
    setDragCollectionId(null)
    setDragOverCollectionId(null)
  }, [collections, dragCollectionId, dragRequestId, onReorderCollections, onMoveRequest, clearRequestDragState])

  const handleCollectionDragEnd = useCallback(() => {
    setDragCollectionId(null)
    setDragOverCollectionId(null)
  }, [])

  const handleRequestDragStart = useCallback((e: React.DragEvent, requestId: string, collectionId: string) => {
    setDragRequestId(requestId)
    dragRequestCollectionId.current = collectionId
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleRequestDragOverCollection = useCallback((e: React.DragEvent, collectionId: string) => {
    if (!dragRequestId) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    setDragRequestOverCollectionId(collectionId)
    setDragOverRequestId(null)
  }, [dragRequestId])

  const handleRequestDragOver = useCallback((e: React.DragEvent, requestId: string, collectionId: string) => {
    if (!dragRequestId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverRequestId(requestId)
    // Show collection header highlight only when hovering a request in a different collection
    setDragRequestOverCollectionId(dragRequestCollectionId.current !== collectionId ? collectionId : null)
  }, [dragRequestId])

  const handleRequestDrop = useCallback((e: React.DragEvent, targetRequestId: string, collectionId: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (!dragRequestId) return

    const sourceCollectionId = dragRequestCollectionId.current

    if (sourceCollectionId !== collectionId) {
      // Cross-collection: move the request to the target collection
      onMoveRequest(dragRequestId, collectionId)
    } else if (dragRequestId !== targetRequestId) {
      // Same-collection reorder
      const collRequests = requests.filter(r => r.collectionId === collectionId)
      const from = collRequests.findIndex(r => r.id === dragRequestId)
      const to = collRequests.findIndex(r => r.id === targetRequestId)
      if (from !== -1 && to !== -1) {
        const reordered = [...collRequests]
        const [moved] = reordered.splice(from, 1)
        reordered.splice(to, 0, moved)
        onReorderRequests(reordered)
      }
    }

    clearRequestDragState()
  }, [requests, dragRequestId, onReorderRequests, onMoveRequest, clearRequestDragState])

  const handleRequestDragEnd = useCallback(() => {
    clearRequestDragState()
  }, [clearRequestDragState])

  // Auto-expand collections when a socket config is saved into them
  useEffect(() => {
    const ids = socketConfigs.map(s => s.collectionId).filter(Boolean) as string[]
    if (ids.length === 0) return
    setExpandedCollections(prev => {
      if (ids.every(id => prev.has(id))) return prev // nothing to add, skip re-render
      const next = new Set(prev)
      ids.forEach(id => next.add(id))
      return next
    })
  }, [socketConfigs])

  const toggleCollection = (id: string) => {
    const newExpanded = new Set(expandedCollections)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedCollections(newExpanded)
  }

  const handleCreate = () => {
    if (inputValue.trim()) {
      onCreateCollection(inputValue.trim())
      setInputValue('')
      setIsCreateDialogOpen(false)
    }
  }

  const handleRename = () => {
    if (!inputValue.trim()) return
    if (selectedCollection) {
      onRenameCollection(selectedCollection.id, inputValue.trim())
      setSelectedCollection(null)
    } else if (renameTarget) {
      if (renameTarget.type === 'request') onRenameRequest?.(renameTarget.id, inputValue.trim())
      else onRenameSocketConfig?.(renameTarget.id, inputValue.trim())
      setRenameTarget(null)
    }
    setInputValue('')
    setIsRenameDialogOpen(false)
  }

  const openRenameDialog = (collection: Collection) => {
    setSelectedCollection(collection)
    setRenameTarget(null)
    setInputValue(collection.name)
    setIsRenameDialogOpen(true)
  }

  const openRenameRequest = (request: RequestConfig) => {
    setRenameTarget({ type: 'request', id: request.id })
    setSelectedCollection(null)
    setInputValue(request.name)
    setIsRenameDialogOpen(true)
  }

  const openRenameSocket = (sc: SocketConfig) => {
    setRenameTarget({ type: 'socket', id: sc.id })
    setSelectedCollection(null)
    setInputValue(sc.name)
    setIsRenameDialogOpen(true)
  }

  const getRequestsForCollection = (collectionId: string) => {
    const all = requests.filter((r) => r.collectionId === collectionId)
    return isSearching ? all.filter(matchesSearch) : all
  }

  const getSocketConfigsForCollection = (collectionId: string) => {
    const all = socketConfigs.filter((s) => s.collectionId === collectionId)
    return isSearching ? all.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase())) : all
  }

  const handleExportCollection = useCallback((collection: Collection) => {
    const collRequests = requests.filter(r => r.collectionId === collection.id)
    const payload = { collection, requests: collRequests }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${collection.name.replace(/[^a-z0-9]/gi, '_')}_collection.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [requests])

  const handleExportAllCollections = useCallback(() => {
    if (collections.length === 0) return
    const payload = collections.map(collection => {
      const collRequests = requests.filter(r => r.collectionId === collection.id)
      const collSockets = socketConfigs.filter(s => s.collectionId === collection.id)
      return { collection, requests: collRequests, socketConfigs: collSockets }
    })
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `all_collections_export.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [collections, requests, socketConfigs])

  // Parse Postman collection format
  const parsePostmanCollection = (data: unknown): { collection: Collection; requests: RequestConfig[]; socketConfigs: SocketConfig[] } | null => {
    try {
      const postmanData = data as {
        info?: { name?: string; description?: string; _postman_id?: string }
        item?: Array<{
          name?: string
          // HTTP request
          request?: {
            method?: string
            url?: string | { raw?: string; query?: Array<{ key: string; value: string; disabled?: boolean }> }
            header?: Array<{ key: string; value: string; disabled?: boolean }>
            body?: {
              mode?: string
              raw?: string
              formdata?: Array<{ key: string; value: string; disabled?: boolean }>
              urlencoded?: Array<{ key: string; value: string; disabled?: boolean }>
            }
            auth?: {
              type?: string
              bearer?: Array<{ key: string; value: string }>
              basic?: Array<{ key: string; value: string }>
              apikey?: Array<{ key: string; value: string }>
            }
          }
          // Socket.IO / WebSocket item
          socket?: {
            version?: string
            url?: string | { raw?: string; query?: Array<{ key: string; value: string; disabled?: boolean }> }
            header?: Array<{ key: string; value: string; disabled?: boolean }>
            auth?: { type?: string; bearer?: Array<{ key: string; value: string }> }
          }
        }>
      }

      if (!postmanData.info?.name) return null

      const now = Date.now()
      const collectionId = generateId()

      const collection: Collection = {
        id: collectionId,
        name: postmanData.info.name,
        description: postmanData.info.description,
        folders: [],
        createdAt: now,
        updatedAt: now,
      }

      const importedRequests: RequestConfig[] = []
      const importedSocketConfigs: SocketConfig[] = []

      const parseItem = (item: NonNullable<typeof postmanData.item>[0]) => {
        // Detect Postman Socket.IO items (they have a `socket` key or url starts with ws/wss)
        if (item.socket) {
          const sock = item.socket
          const rawUrl = typeof sock.url === 'string' ? sock.url : (sock.url?.raw || '')
          const params: KeyValuePair[] = typeof sock.url !== 'string' && sock.url?.query
            ? sock.url.query.map(q => ({ id: generateId(), key: q.key, value: q.value, enabled: !q.disabled }))
            : []
          const headers: KeyValuePair[] = (sock.header || []).map(h => ({ id: generateId(), key: h.key, value: h.value, enabled: !h.disabled }))
          importedSocketConfigs.push(createNewSocketConfig({
            id: generateId(),
            name: item.name || 'Imported Socket',
            url: rawUrl,
            params,
            headers,
            collectionId,
            createdAt: now,
            updatedAt: now,
          }))
          return
        }

        if (!item.request) return

        const req = item.request
        let url = ''
        const params: KeyValuePair[] = []

        if (typeof req.url === 'string') {
          url = req.url
        } else if (req.url) {
          url = req.url.raw || ''
          if (req.url.query) {
            req.url.query.forEach((q) => {
              params.push({
                id: generateId(),
                key: q.key,
                value: q.value,
                enabled: !q.disabled,
              })
            })
          }
        }

        const headers: KeyValuePair[] = (req.header || []).map((h) => ({
          id: generateId(),
          key: h.key,
          value: h.value,
          enabled: !h.disabled,
        }))

        let bodyType: BodyType = 'none'
        let bodyContent = ''
        let formData: KeyValuePair[] = []

        if (req.body) {
          switch (req.body.mode) {
            case 'raw':
              bodyType = 'json'
              bodyContent = req.body.raw || ''
              break
            case 'formdata':
              bodyType = 'form-data'
              formData = (req.body.formdata || []).map((f) => ({
                id: generateId(),
                key: f.key,
                value: f.value,
                enabled: !f.disabled,
              }))
              break
            case 'urlencoded':
              bodyType = 'x-www-form-urlencoded'
              formData = (req.body.urlencoded || []).map((f) => ({
                id: generateId(),
                key: f.key,
                value: f.value,
                enabled: !f.disabled,
              }))
              break
          }
        }

        let auth: AuthConfig = { type: 'none' }
        if (req.auth) {
          switch (req.auth.type) {
            case 'bearer':
              auth = {
                type: 'bearer',
                bearer: { token: req.auth.bearer?.find((b) => b.key === 'token')?.value || '' },
              }
              break
            case 'basic':
              auth = {
                type: 'basic',
                basic: {
                  username: req.auth.basic?.find((b) => b.key === 'username')?.value || '',
                  password: req.auth.basic?.find((b) => b.key === 'password')?.value || '',
                },
              }
              break
            case 'apikey':
              auth = {
                type: 'api-key',
                apiKey: {
                  key: req.auth.apikey?.find((a) => a.key === 'key')?.value || '',
                  value: req.auth.apikey?.find((a) => a.key === 'value')?.value || '',
                  addTo: 'header',
                },
              }
              break
          }
        }

        importedRequests.push({
          id: generateId(),
          name: item.name || 'Imported Request',
          method: (req.method?.toUpperCase() || 'GET') as HttpMethod,
          url,
          params,
          headers,
          body: { type: bodyType, content: bodyContent, formData },
          auth,
          collectionId,
          createdAt: now,
          updatedAt: now,
        })
      }

      postmanData.item?.forEach(parseItem)

      return { collection, requests: importedRequests, socketConfigs: importedSocketConfigs }
    } catch {
      return null
    }
  }

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return

    const failed: string[] = []

    for (const file of files) {
      try {
        const text = await file.text()
        const data = JSON.parse(text)
        // Native export format
        if (data.collection && Array.isArray(data.requests) && data.collection.id) {
          onImportCollection(data.collection, data.requests, data.socketConfigs)
          continue
        }
        // Native export all collections format (Array of collections)
        if (Array.isArray(data) && data[0]?.collection && Array.isArray(data[0]?.requests)) {
          for (const item of data) {
            if (item.collection && Array.isArray(item.requests)) {
               onImportCollection(item.collection, item.requests, item.socketConfigs)
            }
          }
          continue
        }
        // Postman v2.1 format
        const result = parsePostmanCollection(data)
        if (result) {
          onImportCollection(result.collection, result.requests, result.socketConfigs)
        } else {
          failed.push(file.name)
        }
      } catch {
        failed.push(file.name)
      }
    }

    if (failed.length > 0) {
      alert(`Failed to import: ${failed.join(', ')}\n\nPlease ensure they are valid Postman v2.1 export files.`)
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <h3 className="text-sm font-medium text-foreground">Collections</h3>
        {canWrite && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleExportAllCollections}
              title="Export All Collections"
            >
              <Download className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => fileInputRef.current?.click()}
              title="Import Collection"
            >
              <Upload className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setIsCreateDialogOpen(true)}
              title="New Collection"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          multiple
          onChange={handleImport}
          className="hidden"
        />
      </div>

      <div className="px-2 py-1.5 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            ref={searchRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search requests..."
            className="w-full h-7 pl-7 pr-6 text-xs bg-secondary border border-border rounded-md outline-none focus:ring-1 focus:ring-ring font-mono placeholder:font-sans placeholder:text-muted-foreground"
          />
          {isSearching && (
            <button
              onClick={() => { setSearchQuery(''); searchRef.current?.focus() }}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {collections.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <FolderOpen className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-xs">No collections yet</p>
          </div>
        ) : isSearching && !requests.some(matchesSearch) && !socketConfigs.some(s => s.name.toLowerCase().includes(q)) ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <Search className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-xs">No results match "{searchQuery}"</p>
          </div>
        ) : (
          <div className="py-1">
            {collections.filter(c => !isSearching || requests.some(r => r.collectionId === c.id && matchesSearch(r)) || socketConfigs.some(s => s.collectionId === c.id && s.name.toLowerCase().includes(q))).map((collection) => {
              const collectionRequests = getRequestsForCollection(collection.id)
              const collectionSockets = getSocketConfigsForCollection(collection.id)
              const isExpanded = isSearching ? (collectionRequests.length > 0 || collectionSockets.length > 0) : expandedCollections.has(collection.id)
              const isCollectionDraggingOver = dragOverCollectionId === collection.id && dragCollectionId !== collection.id
              const isRequestDraggingOverHeader = dragRequestOverCollectionId === collection.id && dragRequestCollectionId.current !== collection.id

              return (
                <Collapsible
                  key={collection.id}
                  open={isExpanded}
                  onOpenChange={() => toggleCollection(collection.id)}
                >
                  <div
                    className={cn(
                      'group flex items-center hover:bg-secondary/50',
                      dragCollectionId === collection.id && 'opacity-40',
                      isCollectionDraggingOver && 'border-t-2 border-primary',
                      isRequestDraggingOverHeader && 'bg-primary/10 outline outline-1 outline-primary rounded',
                    )}
                    onContextMenu={(e) => { e.preventDefault(); setOpenMenuId(collection.id) }}
                    draggable={canWrite && !isSearching}
                    onDragStart={canWrite && !isSearching ? (e) => handleCollectionDragStart(e, collection.id) : undefined}
                    onDragOver={canWrite && !isSearching ? (e) => {
                      handleCollectionDragOver(e, collection.id)
                      handleRequestDragOverCollection(e, collection.id)
                    } : undefined}
                    onDrop={canWrite && !isSearching ? (e) => handleCollectionDrop(e, collection.id) : undefined}
                    onDragEnd={canWrite && !isSearching ? handleCollectionDragEnd : undefined}
                    onDragLeave={canWrite ? () => setDragRequestOverCollectionId(null) : undefined}
                  >
                    {canWrite && (
                      <span className="pl-1 pr-0.5 cursor-grab text-muted-foreground opacity-0 group-hover:opacity-50 shrink-0">
                        <GripVertical className="h-3.5 w-3.5" />
                      </span>
                    )}
                    <CollapsibleTrigger className="flex items-center flex-1 px-2 py-1.5 text-sm min-w-0">
                      <ChevronRight
                        className={cn(
                          'h-4 w-4 mr-1 transition-transform text-muted-foreground shrink-0',
                          isExpanded && 'rotate-90'
                        )}
                      />
                      <FolderOpen className="h-4 w-4 mr-2 text-primary shrink-0" />
                      <span className="truncate">{collection.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground shrink-0">
                        ({collectionRequests.length})
                      </span>
                    </CollapsibleTrigger>
                    <DropdownMenu open={openMenuId === collection.id} onOpenChange={(o) => setOpenMenuId(o ? collection.id : null)}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 mr-1 shrink-0"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canWrite && (
                          <DropdownMenuItem onClick={() => openRenameDialog(collection)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Rename
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => handleExportCollection(collection)}>
                          <Download className="h-4 w-4 mr-2" />
                          Export
                        </DropdownMenuItem>
                        {canWrite && (
                          <DropdownMenuItem
                            onClick={() => onDeleteCollection(collection.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <CollapsibleContent>
                    {collectionSockets.map((sc) => (
                      <div
                        key={sc.id}
                        className="group flex items-center hover:bg-secondary/50 pl-12 pr-2"
                        onContextMenu={(e) => { e.preventDefault(); setOpenMenuId(sc.id) }}
                      >
                        <button
                          onClick={() => onOpenSocketConfig?.(sc)}
                          className="flex items-center flex-1 py-1.5 min-w-0"
                        >
                          <span className={cn('font-mono text-xs font-semibold mr-2 shrink-0', sc.protocol === 'socketio' ? 'text-[oklch(0.65_0.2_280)]' : 'text-[oklch(0.72_0.19_160)]')}>
                            {sc.protocol === 'socketio' ? 'SIO' : 'WS'}
                          </span>
                          <span className="truncate text-sm text-muted-foreground">{sc.name}</span>
                        </button>
                        {canWrite && (
                          <DropdownMenu open={openMenuId === sc.id} onOpenChange={(o) => setOpenMenuId(o ? sc.id : null)}>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0">
                                <MoreHorizontal className="h-3 w-3 text-muted-foreground" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openRenameSocket(sc)}>
                                <Pencil className="h-4 w-4 mr-2" />
                                Rename
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onDeleteSocketConfig?.(sc.id)} className="text-destructive">
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    ))}
                    {collectionRequests.map((request) => {
                      const isSameCollection = dragRequestCollectionId.current === collection.id
                      const isReqDraggingOver = !sequenceDragMode && dragOverRequestId === request.id && dragRequestId !== request.id
                      return (
                        <div
                          key={request.id}
                          className={cn(
                            'group flex items-center hover:bg-secondary/50 pl-12 pr-2',
                            !sequenceDragMode && dragRequestId === request.id && 'opacity-40',
                            isReqDraggingOver && isSameCollection && 'border-t-2 border-primary',
                            isReqDraggingOver && !isSameCollection && 'border-t-2 border-primary/60',
                            sequenceDragMode && 'cursor-grab',
                          )}
                          onContextMenu={(e) => { e.preventDefault(); setOpenMenuId(request.id) }}
                          draggable={sequenceDragMode || (canWrite && !isSearching)}
                          onDragStart={sequenceDragMode
                            ? (e) => { e.dataTransfer.setData('application/sequence-request', JSON.stringify(request)); e.dataTransfer.effectAllowed = 'copy' }
                            : (canWrite && !isSearching ? (e) => handleRequestDragStart(e, request.id, collection.id) : undefined)}
                          onDragOver={canWrite && !sequenceDragMode && !isSearching ? (e) => handleRequestDragOver(e, request.id, collection.id) : undefined}
                          onDrop={canWrite && !sequenceDragMode && !isSearching ? (e) => handleRequestDrop(e, request.id, collection.id) : undefined}
                          onDragEnd={canWrite && !sequenceDragMode && !isSearching ? handleRequestDragEnd : undefined}
                        >
                          <button
                            onClick={() => onOpenRequest(request)}
                            className="flex items-center flex-1 py-1.5 min-w-0"
                          >
                            <span className={cn('font-mono text-xs font-semibold mr-2 shrink-0', methodColors[request.method])}>
                              {request.method}
                            </span>
                            <span className="truncate text-sm text-muted-foreground">
                              {request.name}
                            </span>
                          </button>
                          {!sequenceDragMode && canWrite && (
                            <DropdownMenu open={openMenuId === request.id} onOpenChange={(o) => setOpenMenuId(o ? request.id : null)}>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0">
                                  <MoreHorizontal className="h-3 w-3 text-muted-foreground" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openRenameRequest(request)}>
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Rename
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setPendingDeleteRequestId(request.id)} className="text-destructive">
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      )
                    })}
                  </CollapsibleContent>
                </Collapsible>
              )
            })}
          </div>
        )}
      </div>

      {/* Create Collection Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Collection</DialogTitle>
          </DialogHeader>
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Collection name"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {renameTarget?.type === 'request' ? 'Rename Request' : renameTarget?.type === 'socket' ? 'Rename Socket' : 'Rename Collection'}
            </DialogTitle>
          </DialogHeader>
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Collection name"
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRenameDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRename}>Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingDeleteRequestId} onOpenChange={(open) => { if (!open) setPendingDeleteRequestId(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete request</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete{' '}
            <span className="font-medium text-foreground">
              {requests.find(r => r.id === pendingDeleteRequestId)?.name ?? 'this request'}
            </span>
            ? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDeleteRequestId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (pendingDeleteRequestId) {
                  onDeleteRequest(pendingDeleteRequestId)
                  setPendingDeleteRequestId(null)
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
