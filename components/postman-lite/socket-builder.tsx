'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import type { SocketConfig, SocketMessage, SocketMessageType, SocketEvent, AuthConfig, SocketProtocol } from '@/lib/db/types'
import { generateId } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { KeyValueEditor } from './key-value-editor'
import { AuthTab } from './auth-tab'
import { VariableHighlightTextarea } from './variable-highlight-textarea'
import { VariableHighlightInput } from './variable-highlight-input'
import { useEnvironmentContext } from './environment-context'
import { cn } from '@/lib/utils'
import { Plus, Trash2, Wifi, WifiOff, Loader2, ArrowUp, ArrowDown, ChevronDown } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface SocketBuilderProps {
  config: SocketConfig
  messages: SocketMessage[]
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error'
  onUpdate: (updates: Partial<SocketConfig>) => void
  onConnect: () => void
  onDisconnect: () => void
  onSendMessage: (event: string, data: string, type: SocketMessageType, ack: boolean) => void
  onClearMessages: () => void
  readOnly?: boolean
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

const statusColors = {
  disconnected: 'text-muted-foreground',
  connecting: 'text-[oklch(0.75_0.18_80)]',
  connected: 'text-[oklch(0.72_0.19_160)]',
  error: 'text-[oklch(0.65_0.22_25)]',
}

const statusLabels = {
  disconnected: 'Disconnected',
  connecting: 'Connecting…',
  connected: 'Connected',
  error: 'Error',
}

const ALL_TABS = ['message', 'events', 'params', 'headers', 'auth'] as const
type SocketTab = typeof ALL_TABS[number]

function tabLabel(tab: SocketTab, config: SocketConfig): string {
  if (tab === 'events') return `Events${config.events.length > 0 ? ` (${config.events.length})` : ''}`
  if (tab === 'params') return `Params${config.params.length > 0 ? ` (${config.params.length})` : ''}`
  if (tab === 'headers') return `Headers${config.headers.length > 0 ? ` (${config.headers.length})` : ''}`
  return tab.charAt(0).toUpperCase() + tab.slice(1)
}

function OverflowTabsList({ config, activeTab, onTabChange }: { config: SocketConfig; activeTab: SocketTab; onTabChange: (tab: SocketTab) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [fits, setFits] = useState(true)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => {
      const items = Array.from(el.querySelectorAll<HTMLElement>('[data-tab-measure]'))
      const totalWidth = items.reduce((sum, item) => sum + item.offsetWidth, 0)
      setFits(totalWidth <= el.offsetWidth)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    measure()
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={containerRef} className="relative flex items-stretch border-b border-border shrink-0 bg-transparent">
      {/* Hidden measurement row */}
      <div className="absolute top-0 left-0 opacity-0 pointer-events-none flex" aria-hidden>
        {ALL_TABS.map(tab => (
          <span key={tab} data-tab-measure className="px-4 py-2 text-sm whitespace-nowrap">
            {tabLabel(tab, config)}
          </span>
        ))}
      </div>

      {fits ? (
        <TabsList className="flex-1 justify-start rounded-none border-none bg-transparent h-auto p-0">
          {ALL_TABS.map(tab => (
            <TabsTrigger
              key={tab}
              value={tab}
              onClick={() => onTabChange(tab)}
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2 text-sm whitespace-nowrap"
            >
              {tabLabel(tab, config)}
            </TabsTrigger>
          ))}
        </TabsList>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 border-primary text-foreground hover:text-foreground transition-colors">
              {tabLabel(activeTab, config)}
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {ALL_TABS.map(tab => (
              <DropdownMenuItem
                key={tab}
                className={cn(activeTab === tab && 'bg-accent text-accent-foreground')}
                onSelect={() => onTabChange(tab)}
              >
                {tabLabel(tab, config)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}

export function SocketBuilder({
  config,
  messages,
  connectionStatus,
  onUpdate,
  onConnect,
  onDisconnect,
  onSendMessage,
  onClearMessages,
  readOnly,
}: SocketBuilderProps) {
  const { variables, updateVariable } = useEnvironmentContext()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [ackEnabled, setAckEnabled] = useState(false)
  const [activeTab, setActiveTab] = useState<SocketTab>('message')

  useEffect(() => {
    if (autoScroll) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, autoScroll])

  const handleSend = useCallback(() => {
    const data = config.messageContent.trim()
    if (!data) return
    onSendMessage(config.messageEvent || 'message', data, config.messageType, ackEnabled)
    onUpdate({ messageContent: '' })
  }, [config.messageContent, config.messageEvent, config.messageType, onSendMessage, onUpdate])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const addEvent = useCallback(() => {
    const event: SocketEvent = { id: generateId(), name: '', enabled: true }
    onUpdate({ events: [...config.events, event] })
  }, [config.events, onUpdate])

  const updateEvent = useCallback((id: string, patch: Partial<SocketEvent>) => {
    onUpdate({ events: config.events.map(e => e.id === id ? { ...e, ...patch } : e) })
  }, [config.events, onUpdate])

  const removeEvent = useCallback((id: string) => {
    onUpdate({ events: config.events.filter(e => e.id !== id) })
  }, [config.events, onUpdate])

  const isConnected = connectionStatus === 'connected'
  const isConnecting = connectionStatus === 'connecting'

  return (
    <div className="flex flex-col h-full">
      {/* URL bar */}
      <div className="flex items-center gap-2 p-4 border-b border-border shrink-0">
        <Select
          value={config.protocol ?? 'ws'}
          onValueChange={(v) => onUpdate({ protocol: v as SocketProtocol })}
          disabled={readOnly || isConnected || isConnecting}
        >
          <SelectTrigger className="w-auto min-w-[60px] bg-secondary border-border h-8 text-xs font-mono font-semibold shrink-0 px-2 gap-1">
            <SelectValue>
              <span className={(config.protocol ?? 'ws') === 'ws' ? 'text-[oklch(0.72_0.19_160)]' : 'text-[oklch(0.65_0.2_250)]'}>
                {(config.protocol ?? 'ws') === 'ws' ? 'WS' : 'SIO'}
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ws">
              <span className="font-mono font-semibold text-[oklch(0.72_0.19_160)]">WS</span>
            </SelectItem>
            <SelectItem value="socketio">
              <span className="font-mono font-semibold text-[oklch(0.65_0.2_250)]">SIO</span>
            </SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1">
          <VariableHighlightInput
            value={config.url}
            onChange={(url) => onUpdate({ url })}
            placeholder={config.protocol === 'socketio' ? 'https://example.com' : 'ws://localhost:3000'}
            className="bg-secondary border-border"
            variables={variables}
            onUpdateVariable={updateVariable}
            disabled={isConnected || isConnecting}
            readOnly={readOnly}
          />
        </div>
        <div className={cn('flex items-center gap-1 text-xs font-medium shrink-0', statusColors[connectionStatus])}>
          {isConnecting
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : isConnected
              ? <Wifi className="h-3.5 w-3.5" />
              : <WifiOff className="h-3.5 w-3.5" />}
          <span>{statusLabels[connectionStatus]}</span>
        </div>
        {isConnected || isConnecting ? (
          <Button variant="destructive" className="px-6" onClick={onDisconnect}>
            Disconnect
          </Button>
        ) : (
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90 px-6"
            disabled={!config.url}
            onClick={onConnect}
          >
            Connect
          </Button>
        )}
      </div>

      {/* Body: left config pane + right message log */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Left: config tabs */}
        <ResizablePanel defaultSize={50} minSize={20} className="flex flex-col min-h-0">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SocketTab)} className="flex flex-col flex-1 min-h-0">
            <OverflowTabsList config={config} activeTab={activeTab} onTabChange={setActiveTab} />

            {/* Message tab */}
            <TabsContent value="message" className="flex-1 flex flex-col min-h-0 m-0 p-4 gap-3">
              <div className="flex items-center gap-2">
                <Select
                  value={config.messageType}
                  onValueChange={(v) => onUpdate({ messageType: v as SocketMessageType })}
                  disabled={readOnly}
                >
                  <SelectTrigger className="w-[110px] bg-secondary border-border h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="json">JSON</SelectItem>
                    <SelectItem value="binary">Binary</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex-1">
                  <Input
                    value={config.messageEvent}
                    onChange={(e) => onUpdate({ messageEvent: e.target.value })}
                    placeholder="Event name (e.g. message)"
                    className="h-8 bg-secondary border-border text-sm font-mono"
                    readOnly={readOnly}
                  />
                </div>
              </div>
              <div className="flex-1 min-h-0">
                <VariableHighlightTextarea
                  value={config.messageContent}
                  onChange={(messageContent) => onUpdate({ messageContent })}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    config.messageType === 'json'
                      ? '{\n  "key": "value"\n}'
                      : config.messageType === 'binary'
                        ? 'Hex or base64 encoded binary data'
                        : 'Message content'
                  }
                  variables={variables}
                  onUpdateVariable={updateVariable}
                  language={config.messageType === 'json' ? 'json' : 'text'}
                  className="h-full"
                  readOnly={readOnly}
                />
              </div>
              {!readOnly && (
                <div className="flex items-center justify-end gap-3">
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <Checkbox
                      checked={ackEnabled}
                      onCheckedChange={(v) => setAckEnabled(!!v)}
                      disabled={!isConnected}
                      className="h-3.5 w-3.5"
                    />
                    <span className="text-xs text-muted-foreground font-mono">ACK</span>
                  </label>
                  <Button
                    onClick={handleSend}
                    disabled={!isConnected || !config.messageContent.trim()}
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                    size="sm"
                  >
                    Send <span className="ml-1 text-xs opacity-60">Ctrl+Enter</span>
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* Events tab */}
            <TabsContent value="events" className="flex-1 overflow-auto m-0 p-4">
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Listen for these events from the server. When received, they will appear in the message log.
                </p>
                <div className="space-y-2">
                  {config.events.map(event => (
                    <div key={event.id} className="flex items-center gap-2">
                      <Switch
                        checked={event.enabled}
                        onCheckedChange={readOnly ? undefined : (checked) => updateEvent(event.id, { enabled: checked })}
                        disabled={readOnly}
                        className="scale-75"
                      />
                      <Input
                        value={event.name}
                        onChange={(e) => updateEvent(event.id, { name: e.target.value })}
                        placeholder="Event name (e.g. chat, update)"
                        className="h-8 bg-secondary border-border text-sm font-mono flex-1"
                        readOnly={readOnly}
                      />
                      {!readOnly && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeEvent(event.id)}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                {!readOnly && (
                  <Button variant="ghost" size="sm" onClick={addEvent} className="text-muted-foreground hover:text-foreground">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Event
                  </Button>
                )}
              </div>
            </TabsContent>

            {/* Params tab */}
            <TabsContent value="params" className="flex-1 overflow-auto m-0 p-4">
              <KeyValueEditor
                pairs={config.params}
                onChange={(params) => onUpdate({ params })}
                keyPlaceholder="Key"
                valuePlaceholder="Value"
                readOnly={readOnly}
              />
            </TabsContent>

            {/* Headers tab */}
            <TabsContent value="headers" className="flex-1 overflow-auto m-0 p-4">
              <KeyValueEditor
                pairs={config.headers}
                onChange={(headers) => onUpdate({ headers })}
                keyPlaceholder="Header"
                valuePlaceholder="Value"
                readOnly={readOnly}
              />
            </TabsContent>

            {/* Auth tab */}
            <TabsContent value="auth" className="flex-1 overflow-auto m-0">
              <AuthTab
                auth={config.auth}
                onChange={(auth: AuthConfig) => onUpdate({ auth })}
                readOnly={readOnly}
              />
            </TabsContent>
          </Tabs>
        </ResizablePanel>

        <ResizableHandle className="w-px bg-border" />

        {/* Right: message log */}
        <ResizablePanel defaultSize={50} minSize={20} className="flex flex-col min-h-0">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Messages {messages.length > 0 && `(${messages.length})`}
            </span>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                <Checkbox
                  checked={autoScroll}
                  onCheckedChange={(c) => setAutoScroll(!!c)}
                  className="border-border h-3 w-3"
                />
                Auto-scroll
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearMessages}
                disabled={messages.length === 0}
                className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-2 space-y-1 font-mono text-xs">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                <Wifi className="h-8 w-8 opacity-30" />
                <p className="text-xs">
                  {isConnected ? 'No messages yet. Send one or wait for server events.' : 'Connect to start receiving messages.'}
                </p>
              </div>
            ) : (
              messages.map(msg => {
                const isInfo = msg.direction === 'received' && msg.size === 0
                if (isInfo) {
                  const eventName = msg.data.match(/^Listening on "(.+)"$/)?.[1]
                  return (
                    <div key={msg.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-[oklch(0.25_0.06_280/0.4)] border border-[oklch(0.55_0.2_280/0.3)]">
                      <span className="text-[10px] text-muted-foreground shrink-0">{formatTime(msg.timestamp)}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold font-mono bg-[oklch(0.45_0.2_280)] text-[oklch(0.95_0.05_280)] shrink-0">
                        LISTEN
                      </span>
                      {eventName && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold font-mono bg-[oklch(0.35_0.15_160)] text-[oklch(0.85_0.15_160)] shrink-0">
                          {eventName}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground italic">listening for events</span>
                    </div>
                  )
                }
                const isAck = msg.event === '__ack__'
                return (
                  <div
                    key={msg.id}
                    className={cn(
                      'flex gap-2 rounded px-2 py-1.5',
                      isAck
                        ? 'bg-[oklch(0.25_0.06_80/0.4)] border border-[oklch(0.55_0.18_80/0.3)]'
                        : msg.direction === 'sent'
                          ? 'bg-primary/5 border border-primary/10'
                          : 'bg-secondary border border-border',
                    )}
                  >
                    <div className="shrink-0 mt-0.5">
                      {msg.direction === 'sent'
                        ? <ArrowUp className="h-3 w-3 text-primary" />
                        : <ArrowDown className="h-3 w-3 text-[oklch(0.72_0.19_160)]" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        {isAck
                          ? <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold font-mono bg-[oklch(0.45_0.18_80)] text-[oklch(0.95_0.05_80)] shrink-0">ACK</span>
                          : msg.event && <span className="text-primary font-semibold truncate max-w-[120px]">{msg.event}</span>
                        }
                        <span className="text-muted-foreground text-[10px] shrink-0">{formatTime(msg.timestamp)}</span>
                        <span className="text-muted-foreground text-[10px] shrink-0">{formatSize(msg.size)}</span>
                        <span className="text-muted-foreground text-[10px] shrink-0 uppercase">{msg.type}</span>
                      </div>
                      <pre className="whitespace-pre-wrap break-all text-foreground leading-relaxed">{msg.data}</pre>
                    </div>
                  </div>
                )
              })
            )}
            <div ref={messagesEndRef} />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
