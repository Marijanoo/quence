'use client'

import { useState, useRef, useEffect } from 'react'
import type { RequestConfig, BodyType, HttpMethod, KeyValuePair, AuthConfig } from '@/lib/db/types'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { UrlBar } from './url-bar'
import { ParamsTab } from './params-tab'
import { HeadersTab } from './headers-tab'
import { BodyTab } from './body-tab'
import { AuthTab } from './auth-tab'
import { splitUrl, paramsToSearch, searchToParams } from '@/lib/url-params'

interface RequestBuilderProps {
  request: RequestConfig
  onUpdate: (updates: Partial<RequestConfig>) => void
  onSend: () => void
  onCancel?: () => void
  isLoading: boolean
  hideUrlBar?: boolean
  readOnly?: boolean
  activeRequestTab?: string
  onRequestTabChange?: (tab: string) => void
}

export function RequestBuilder({
  request,
  onUpdate,
  onSend,
  onCancel,
  isLoading,
  hideUrlBar,
  readOnly,
  activeRequestTab,
  onRequestTabChange,
}: RequestBuilderProps) {
  const [isDropdown, setIsDropdown] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const tabsMeasureRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current || !tabsMeasureRef.current) return
    const container = containerRef.current
    const measure = tabsMeasureRef.current
    const observer = new ResizeObserver(() => {
      const items = Array.from(measure.querySelectorAll<HTMLElement>('[data-tab-measure]'))
      const totalWidth = items.reduce((sum, item) => sum + item.offsetWidth, 0)
      setIsDropdown(totalWidth > container.offsetWidth)
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [request.params.length, request.headers.length])

  return (
    <div className="flex flex-col h-full min-w-0 overflow-hidden" ref={containerRef}>
      {!hideUrlBar && (
        <UrlBar
          request={request}
          onMethodChange={(method: HttpMethod) => onUpdate({ method })}
          onUrlChange={(url) => {
            const { search } = splitUrl(url)
            const params = searchToParams(search, request.params)
            onUpdate({ url, params })
          }}
          onCurlImport={onUpdate}
          onSend={onSend}
          onCancel={onCancel ?? (() => {})}
          isLoading={isLoading}
          readOnly={readOnly}
        />
      )}

      <div className="flex-1 flex flex-col min-h-0 min-w-0 relative">
        {/* Hidden measurement container to determine if tabs fit */}
        <div
          ref={tabsMeasureRef}
          className="absolute opacity-0 pointer-events-none flex"
          aria-hidden="true"
        >
          <span data-tab-measure className="px-4 py-2 text-sm whitespace-nowrap">Params{request.params.length > 0 ? ` (${request.params.length})` : ''}</span>
          <span data-tab-measure className="px-4 py-2 text-sm whitespace-nowrap">Headers{request.headers.length > 0 ? ` (${request.headers.length})` : ''}</span>
          <span data-tab-measure className="px-4 py-2 text-sm whitespace-nowrap">Body</span>
          <span data-tab-measure className="px-4 py-2 text-sm whitespace-nowrap">Auth</span>
        </div>

        <Tabs value={activeRequestTab ?? 'params'} onValueChange={onRequestTabChange} className="flex-1 flex flex-col min-h-0 min-w-0">
          {isDropdown ? (
            <div className="flex items-stretch border-b border-border shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 border-primary text-foreground hover:text-foreground transition-colors">
                    {activeRequestTab === 'headers'
                      ? `Headers${request.headers.length > 0 ? ` (${request.headers.length})` : ''}`
                      : activeRequestTab === 'params'
                        ? `Params${request.params.length > 0 ? ` (${request.params.length})` : ''}`
                        : activeRequestTab === 'body'
                          ? 'Body'
                          : 'Auth'}
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {(['params', 'headers', 'body', 'auth'] as const).map(tab => (
                    <DropdownMenuItem
                      key={tab}
                      className={cn(activeRequestTab === tab && 'bg-accent text-accent-foreground')}
                      onSelect={() => onRequestTabChange?.(tab)}
                    >
                      {tab === 'params'
                        ? `Params${request.params.length > 0 ? ` (${request.params.length})` : ''}`
                        : tab === 'headers'
                          ? `Headers${request.headers.length > 0 ? ` (${request.headers.length})` : ''}`
                          : tab === 'body' ? 'Body' : 'Auth'}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent h-auto p-0">
              <TabsTrigger
                value="params"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
              >
                Params{request.params.length > 0 ? ` (${request.params.length})` : ''}
              </TabsTrigger>
              <TabsTrigger
                value="headers"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
              >
                Headers{request.headers.length > 0 ? ` (${request.headers.length})` : ''}
              </TabsTrigger>
              <TabsTrigger
                value="body"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
              >
                Body
              </TabsTrigger>
              <TabsTrigger
                value="auth"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
              >
                Auth
              </TabsTrigger>
            </TabsList>
          )}

          <TabsContent value="params" className="flex-1 overflow-auto m-0">
            <ParamsTab
              params={request.params}
              onChange={(params: KeyValuePair[]) => {
                const { base } = splitUrl(request.url)
                const search = paramsToSearch(params)
                const url = search ? `${base}?${search}` : base
                onUpdate({ params, url })
              }}
              readOnly={readOnly}
            />
          </TabsContent>

          <TabsContent value="headers" className="flex-1 overflow-auto m-0">
            <HeadersTab
              headers={request.headers}
              onChange={(headers: KeyValuePair[]) => onUpdate({ headers })}
              readOnly={readOnly}
            />
          </TabsContent>

          <TabsContent value="body" className="flex-1 overflow-auto m-0">
            <BodyTab
              bodyType={request.body.type}
              content={request.body.content}
              formData={request.body.formData}
              onTypeChange={(type: BodyType) => onUpdate({ body: { ...request.body, type } })}
              onContentChange={(content) => onUpdate({ body: { ...request.body, content } })}
              onFormDataChange={(formData) => onUpdate({ body: { ...request.body, formData } })}
              readOnly={readOnly}
            />
          </TabsContent>

          <TabsContent value="auth" className="flex-1 overflow-auto m-0">
            <AuthTab
              auth={request.auth}
              onChange={(auth: AuthConfig) => onUpdate({ auth })}
              readOnly={readOnly}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
