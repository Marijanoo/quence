'use client'

import { useState, useRef } from 'react'
import type { Collection, RequestConfig, HttpMethod, KeyValuePair, AuthConfig, BodyType } from '@/lib/db/types'
import { cn } from '@/lib/utils'
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
  FileJson,
  Upload,
} from 'lucide-react'

interface CollectionsPanelProps {
  collections: Collection[]
  requests: RequestConfig[]
  onCreateCollection: (name: string) => void
  onDeleteCollection: (id: string) => void
  onRenameCollection: (id: string, name: string) => void
  onOpenRequest: (request: RequestConfig) => void
  onDeleteRequest: (id: string) => void
  onSaveRequest: (request: RequestConfig, collectionId: string) => void
  onImportCollection: (collection: Collection, requests: RequestConfig[]) => void
}

const methodColors: Record<HttpMethod, string> = {
  GET: 'text-[oklch(0.72_0.19_160)]',
  POST: 'text-[oklch(0.75_0.18_80)]',
  PUT: 'text-[oklch(0.65_0.2_250)]',
  PATCH: 'text-[oklch(0.7_0.15_300)]',
  DELETE: 'text-[oklch(0.65_0.22_25)]',
  HEAD: 'text-[oklch(0.6_0.12_200)]',
  OPTIONS: 'text-muted-foreground',
}

export function CollectionsPanel({
  collections,
  requests,
  onCreateCollection,
  onDeleteCollection,
  onRenameCollection,
  onOpenRequest,
  onDeleteRequest,
  onImportCollection,
}: CollectionsPanelProps) {
  const [expandedCollections, setExpandedCollections] = useState<Set<string>>(new Set())
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false)
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null)
  const [inputValue, setInputValue] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    if (inputValue.trim() && selectedCollection) {
      onRenameCollection(selectedCollection.id, inputValue.trim())
      setInputValue('')
      setSelectedCollection(null)
      setIsRenameDialogOpen(false)
    }
  }

  const openRenameDialog = (collection: Collection) => {
    setSelectedCollection(collection)
    setInputValue(collection.name)
    setIsRenameDialogOpen(true)
  }

  const getRequestsForCollection = (collectionId: string) => {
    return requests.filter((r) => r.collectionId === collectionId)
  }

  // Parse Postman collection format
  const parsePostmanCollection = (data: unknown): { collection: Collection; requests: RequestConfig[] } | null => {
    try {
      const postmanData = data as {
        info?: { name?: string; description?: string; _postman_id?: string }
        item?: Array<{
          name?: string
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
        }>
      }

      if (!postmanData.info?.name) return null

      const now = Date.now()
      const collectionId = crypto.randomUUID()

      const collection: Collection = {
        id: collectionId,
        name: postmanData.info.name,
        description: postmanData.info.description,
        folders: [],
        createdAt: now,
        updatedAt: now,
      }

      const importedRequests: RequestConfig[] = []

      const parseItem = (item: NonNullable<typeof postmanData.item>[0]) => {
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
                id: crypto.randomUUID(),
                key: q.key,
                value: q.value,
                enabled: !q.disabled,
              })
            })
          }
        }

        const headers: KeyValuePair[] = (req.header || []).map((h) => ({
          id: crypto.randomUUID(),
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
                id: crypto.randomUUID(),
                key: f.key,
                value: f.value,
                enabled: !f.disabled,
              }))
              break
            case 'urlencoded':
              bodyType = 'x-www-form-urlencoded'
              formData = (req.body.urlencoded || []).map((f) => ({
                id: crypto.randomUUID(),
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
          id: crypto.randomUUID(),
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

      return { collection, requests: importedRequests }
    } catch {
      return null
    }
  }

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const data = JSON.parse(text)
      const result = parsePostmanCollection(data)

      if (result) {
        onImportCollection(result.collection, result.requests)
      } else {
        alert('Invalid collection format. Please use a Postman v2.1 export file.')
      }
    } catch {
      alert('Failed to parse collection file. Please ensure it is a valid JSON file.')
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <h3 className="text-sm font-medium text-foreground">Collections</h3>
        <div className="flex items-center gap-1">
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
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleImport}
          className="hidden"
        />
      </div>

      <div className="flex-1 overflow-auto">
        {collections.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <FolderOpen className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-xs">No collections yet</p>
          </div>
        ) : (
          <div className="py-1">
            {collections.map((collection) => {
              const collectionRequests = getRequestsForCollection(collection.id)
              const isExpanded = expandedCollections.has(collection.id)

              return (
                <Collapsible
                  key={collection.id}
                  open={isExpanded}
                  onOpenChange={() => toggleCollection(collection.id)}
                >
                  <div className="group flex items-center hover:bg-secondary/50">
                    <CollapsibleTrigger className="flex items-center flex-1 px-3 py-1.5 text-sm">
                      <ChevronRight
                        className={cn(
                          'h-4 w-4 mr-1 transition-transform text-muted-foreground',
                          isExpanded && 'rotate-90'
                        )}
                      />
                      <FolderOpen className="h-4 w-4 mr-2 text-primary" />
                      <span className="truncate">{collection.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({collectionRequests.length})
                      </span>
                    </CollapsibleTrigger>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 mr-1"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openRenameDialog(collection)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onDeleteCollection(collection.id)}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <CollapsibleContent>
                    {collectionRequests.map((request) => (
                      <div
                        key={request.id}
                        className="group flex items-center hover:bg-secondary/50 pl-8 pr-2"
                      >
                        <button
                          onClick={() => onOpenRequest(request)}
                          className="flex items-center flex-1 py-1.5 text-sm"
                        >
                          <FileJson className="h-4 w-4 mr-2 text-muted-foreground" />
                          <span className={cn('font-mono text-xs mr-2 w-12', methodColors[request.method])}>
                            {request.method}
                          </span>
                          <span className="truncate text-muted-foreground">
                            {request.name}
                          </span>
                        </button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100"
                          onClick={() => onDeleteRequest(request.id)}
                        >
                          <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                    ))}
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

      {/* Rename Collection Dialog */}
      <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Collection</DialogTitle>
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
    </div>
  )
}
