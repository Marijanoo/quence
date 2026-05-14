'use client'

import type { RequestConfig, BodyType, HttpMethod, KeyValuePair, AuthConfig } from '@/lib/db/types'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UrlBar } from './url-bar'
import { ParamsTab } from './params-tab'
import { HeadersTab } from './headers-tab'
import { BodyTab } from './body-tab'
import { AuthTab } from './auth-tab'

interface RequestBuilderProps {
  request: RequestConfig
  onUpdate: (updates: Partial<RequestConfig>) => void
  onSend: () => void
  onCancel?: () => void
  isLoading: boolean
  hideUrlBar?: boolean
}

export function RequestBuilder({
  request,
  onUpdate,
  onSend,
  onCancel,
  isLoading,
  hideUrlBar,
}: RequestBuilderProps) {
  return (
    <div className="flex flex-col h-full">
      {!hideUrlBar && (
        <UrlBar
          request={request}
          onMethodChange={(method: HttpMethod) => onUpdate({ method })}
          onUrlChange={(url) => onUpdate({ url })}
          onCurlImport={onUpdate}
          onSend={onSend}
          onCancel={onCancel ?? (() => {})}
          isLoading={isLoading}
        />
      )}

      <Tabs defaultValue="params" className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent h-auto p-0">
          <TabsTrigger
            value="params"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
          >
            Params {request.params.length > 0 && `(${request.params.length})`}
          </TabsTrigger>
          <TabsTrigger
            value="headers"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
          >
            Headers {request.headers.length > 0 && `(${request.headers.length})`}
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

        <TabsContent value="params" className="flex-1 overflow-auto m-0">
          <ParamsTab
            params={request.params}
            onChange={(params: KeyValuePair[]) => onUpdate({ params })}
          />
        </TabsContent>

        <TabsContent value="headers" className="flex-1 overflow-auto m-0">
          <HeadersTab
            headers={request.headers}
            onChange={(headers: KeyValuePair[]) => onUpdate({ headers })}
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
          />
        </TabsContent>

        <TabsContent value="auth" className="flex-1 overflow-auto m-0">
          <AuthTab
            auth={request.auth}
            onChange={(auth: AuthConfig) => onUpdate({ auth })}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
