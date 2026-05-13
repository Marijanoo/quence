'use client'

import { useState, useCallback, useEffect } from 'react'
import type { RequestConfig, ResponseData, HistoryEntry, Collection } from '@/lib/db/types'
import { createNewRequest } from '@/lib/db/types'
import {
  useWorkspaceManager,
  useCollections,
  useRequests,
  useHistory,
  useEnvironments,
  useWorkspace,
} from '@/hooks/use-database'
import { parseVariables } from '@/lib/variable-parser'
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
import { EnvironmentSelector } from './environment-selector'
import { EnvironmentProvider } from './environment-context'
import { TitleBar } from './title-bar'
import { SettingsPanel } from './settings-panel'
import { WorkspaceDropdown } from './workspace-dropdown'
import { Save, PanelBottom, PanelRight, Settings2 } from 'lucide-react'

export function PostmanLite() {
  const [isLoading, setIsLoading] = useState(false)
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false)
  const [responseLayout, setResponseLayout] = useState<'side' | 'bottom'>('side')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [saveRequestName, setSaveRequestName] = useState('')
  const [saveCollectionId, setSaveCollectionId] = useState<string>('')

  // Workspace manager
  const {
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    isLoading: workspaceManagerLoading,
    create: createWorkspace,
    rename: renameWorkspace,
    remove: removeWorkspace,
    switchTo: switchWorkspace,
  } = useWorkspaceManager()

  // Data hooks — all scoped to the active workspace
  const { collections, create: createCollection, update: updateCollection, remove: removeCollection, importCollection } = useCollections(activeWorkspaceId)
  const { requests, create: createRequest, remove: removeRequest, refresh: refreshRequests, importRequests } = useRequests()
  const { history, add: addToHistory, remove: removeHistoryEntry, clear: clearHistory } = useHistory(activeWorkspaceId)
  const { environments, activeEnvironment, create: createEnvironment, update: updateEnvironment, remove: removeEnvironment, setActive: setActiveEnvironment, importEnvironment } = useEnvironments(activeWorkspaceId)
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
  } = useWorkspace(activeWorkspaceId)

  // Execute request
  const executeRequest = useCallback(async () => {
    if (!activeTab) return

    setIsLoading(true)

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
          headers[h.key] = parseVariables(h.value, envVariables)
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
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
        if (request.body.type === 'json' || request.body.type === 'raw') {
          requestBody = parseVariables(request.body.content, envVariables)
          if (request.body.type === 'json' && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/json'
          }
        } else if (request.body.type === 'form-data' || request.body.type === 'x-www-form-urlencoded') {
          const formData = request.body.formData?.filter((f) => f.enabled && f.key) || []
          if (request.body.type === 'x-www-form-urlencoded') {
            const params = new URLSearchParams()
            formData.forEach((f) => params.append(f.key, parseVariables(f.value, envVariables)))
            requestBody = params.toString()
            headers['Content-Type'] = 'application/x-www-form-urlencoded'
          } else {
            // For form-data, we'll send as JSON and let the proxy handle it
            const data: Record<string, string> = {}
            formData.forEach((f) => { data[f.key] = parseVariables(f.value, envVariables) })
            requestBody = JSON.stringify(data)
            headers['Content-Type'] = 'application/json'
          }
        }
      }

      let responseData: ResponseData;

      if (typeof window !== 'undefined' && window.electronAPI) {
        // Use Electron IPC
        responseData = await window.electronAPI.makeRequest({
          url,
          method: request.method,
          headers,
          requestBody,
        });
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
          }),
        })
        responseData = await response.json()
      }

      // Update tab with response
      await setActiveResponse(responseData)

      // Add to history
      const historyEntry: HistoryEntry = {
        id: crypto.randomUUID(),
        request: { ...request },
        response: responseData,
        timestamp: Date.now(),
        workspaceId: activeWorkspaceId ?? undefined,
      }
      await addToHistory(historyEntry)

    } catch (error) {
      const errorResponse: ResponseData = {
        status: 0,
        statusText: 'Error',
        headers: {},
        body: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }, null, 2),
        size: 0,
        time: 0,
        contentType: 'application/json',
        isBinary: false,
      }
      await setActiveResponse(errorResponse)
    } finally {
      setIsLoading(false)
    }
  }, [activeTab, activeEnvironment, setActiveResponse, addToHistory])

  // Open saved request in new tab
  const openRequest = useCallback(async (request: RequestConfig) => {
    await createTab({ ...request }, request.id)
  }, [createTab])

  // Open history entry in new tab
  const openHistoryEntry = useCallback(async (entry: HistoryEntry) => {
    const newRequest = createNewRequest({
      ...entry.request,
      id: crypto.randomUUID(), // New ID since it's not saved
    })
    await createTab(newRequest)
    // Show the response from history
    if (entry.response) {
      // Need to wait for tab to be created, then set response
      setTimeout(async () => {
        await setActiveResponse(entry.response)
      }, 100)
    }
  }, [createTab, setActiveResponse])

  // Save current request to collection
  const saveCurrentRequest = useCallback(async () => {
    if (!activeTab || !saveCollectionId || !saveRequestName.trim()) return

    const request: RequestConfig = {
      ...activeTab.request,
      name: saveRequestName.trim(),
      collectionId: saveCollectionId,
    }

    await createRequest(request)
    await markTabSaved(activeTab.id, request.id)
    await refreshRequests()

    setSaveRequestName('')
    setSaveCollectionId('')
    setIsSaveDialogOpen(false)
  }, [activeTab, saveCollectionId, saveRequestName, createRequest, markTabSaved, refreshRequests])

  // Open save dialog
  const openSaveDialog = useCallback(() => {
    if (activeTab) {
      setSaveRequestName(activeTab.request.name || 'New Request')
      setSaveCollectionId(collections[0]?.id || '')
      setIsSaveDialogOpen(true)
    }
  }, [activeTab, collections])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input field (except for saving)
      const isInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      
      if (e.ctrlKey && !e.altKey && !e.metaKey) {
        if (e.key.toLowerCase() === 's') {
          e.preventDefault();
          openSaveDialog();
        } else if (e.key.toLowerCase() === 't') {
          e.preventDefault();
          createTab();
        } else if (e.key.toLowerCase() === 'w') {
          e.preventDefault();
          if (activeTabId) {
            closeTab(activeTabId);
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
  }, [activeTabId, tabs, createTab, closeTab, setActiveTab, openSaveDialog, executeRequest]);

  // Import collection handler
  const handleImportCollection = useCallback(async (collection: Collection, importedRequests: RequestConfig[]) => {
    await importCollection(collection)
    await importRequests(importedRequests)
  }, [importCollection, importRequests])

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
        />
        <div className="flex items-center gap-2">
          <EnvironmentSelector
            environments={environments}
            activeEnvironment={activeEnvironment}
            onSelect={setActiveEnvironment}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={openSaveDialog}
            disabled={!activeTab}
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
            onCreateCollection={createCollection}
            onDeleteCollection={removeCollection}
            onRenameCollection={(id, name) => updateCollection(id, { name })}
            onOpenRequest={openRequest}
            onDeleteRequest={removeRequest}
            onSaveRequest={() => {}}
            onImportCollection={handleImportCollection}
            onOpenHistoryEntry={openHistoryEntry}
            onDeleteHistoryEntry={removeHistoryEntry}
            onClearHistory={clearHistory}
            onCreateEnvironment={createEnvironment}
            onImportEnvironment={importEnvironment}
            onDeleteEnvironment={removeEnvironment}
            onUpdateEnvironment={updateEnvironment}
            onSetActiveEnvironment={setActiveEnvironment}
          />
        </ResizablePanel>

        <ResizableHandle className="w-px bg-border" />

        {/* Request/Response area */}
        <ResizablePanel defaultSize={80}>
          <div className="flex flex-col h-full">
            {/* Tab bar */}
            <TabBar
              tabs={tabs}
              activeTabId={activeTabId}
              onSelectTab={setActiveTab}
              onCloseTab={closeTab}
              onNewTab={() => createTab()}
            />

            {/* Request builder and response viewer */}
            <ResizablePanelGroup
              key={responseLayout}
              direction={responseLayout === 'side' ? 'horizontal' : 'vertical'}
              className="flex-1"
            >
              <ResizablePanel defaultSize={50} minSize={30}>
                {activeTab && (
                  <RequestBuilder
                    request={activeTab.request}
                    onUpdate={updateActiveRequest}
                    onSend={executeRequest}
                    isLoading={isLoading}
                  />
                )}
              </ResizablePanel>

              <ResizableHandle className={responseLayout === 'side' ? 'w-px bg-border' : 'h-px bg-border'} />

              <ResizablePanel defaultSize={50} minSize={20}>
                <ResponseViewer
                  response={activeTab?.response || null}
                  isLoading={isLoading}
                />
              </ResizablePanel>
            </ResizablePanelGroup>
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

      <SettingsPanel open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

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
    </div>
    </EnvironmentProvider>
  )
}
