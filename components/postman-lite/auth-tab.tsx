'use client'

import type { AuthConfig, AuthType } from '@/lib/db/types'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { VariableHighlightInput } from './variable-highlight-input'
import { useEnvironmentContext } from './environment-context'

interface AuthTabProps {
  auth: AuthConfig
  onChange: (auth: AuthConfig) => void
  readOnly?: boolean
}

const authTypes: { value: AuthType; label: string }[] = [
  { value: 'none', label: 'No Auth' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'basic', label: 'Basic Auth' },
  { value: 'api-key', label: 'API Key' },
]

export function AuthTab({ auth, onChange, readOnly }: AuthTabProps) {
  const { variables, updateVariable } = useEnvironmentContext()

  return (
    <div className="p-4 space-y-4">
      <Select
        value={auth.type}
        onValueChange={(v) => onChange({ ...auth, type: v as AuthType })}
        disabled={readOnly}
      >
        <SelectTrigger className="w-[200px] bg-secondary border-border">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {authTypes.map((type) => (
            <SelectItem key={type.value} value={type.value}>
              {type.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {auth.type === 'none' && (
        <p className="text-muted-foreground text-sm">
          This request does not use any authorization.
        </p>
      )}

      {auth.type === 'bearer' && (
        <div className="space-y-2">
          <Label htmlFor="token" className="text-sm">Token</Label>
          <VariableHighlightInput
            value={auth.bearer?.token || ''}
            onChange={(value) =>
              onChange({ ...auth, bearer: { token: value } })
            }
            placeholder="Enter bearer token"
            className="bg-secondary border-border"
            variables={variables}
            onUpdateVariable={updateVariable}
            readOnly={readOnly}
          />
        </div>
      )}

      {auth.type === 'basic' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username" className="text-sm">Username</Label>
            <VariableHighlightInput
              value={auth.basic?.username || ''}
              onChange={(value) =>
                onChange({
                  ...auth,
                  basic: { ...auth.basic, username: value, password: auth.basic?.password || '' },
                })
              }
              placeholder="Username"
              className="bg-secondary border-border"
              variables={variables}
              onUpdateVariable={updateVariable}
              readOnly={readOnly}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm">Password</Label>
            <VariableHighlightInput
              value={auth.basic?.password || ''}
              onChange={(value) =>
                onChange({
                  ...auth,
                  basic: { ...auth.basic, username: auth.basic?.username || '', password: value },
                })
              }
              placeholder="Password"
              className="bg-secondary border-border"
              variables={variables}
              onUpdateVariable={updateVariable}
              readOnly={readOnly}
            />
          </div>
        </div>
      )}

      {auth.type === 'api-key' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="key" className="text-sm">Key</Label>
            <VariableHighlightInput
              value={auth.apiKey?.key || ''}
              onChange={(value) =>
                onChange({
                  ...auth,
                  apiKey: { ...auth.apiKey, key: value, value: auth.apiKey?.value || '', addTo: auth.apiKey?.addTo || 'header' },
                })
              }
              placeholder="X-API-Key"
              className="bg-secondary border-border"
              variables={variables}
              onUpdateVariable={updateVariable}
              readOnly={readOnly}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="value" className="text-sm">Value</Label>
            <VariableHighlightInput
              value={auth.apiKey?.value || ''}
              onChange={(value) =>
                onChange({
                  ...auth,
                  apiKey: { ...auth.apiKey, key: auth.apiKey?.key || '', value: value, addTo: auth.apiKey?.addTo || 'header' },
                })
              }
              placeholder="API Key value"
              className="bg-secondary border-border"
              variables={variables}
              onUpdateVariable={updateVariable}
              readOnly={readOnly}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Add to</Label>
            <Select
              value={auth.apiKey?.addTo || 'header'}
              onValueChange={(v) =>
                onChange({
                  ...auth,
                  apiKey: { ...auth.apiKey, key: auth.apiKey?.key || '', value: auth.apiKey?.value || '', addTo: v as 'header' | 'query' },
                })
              }
              disabled={readOnly}
            >
              <SelectTrigger className="w-[150px] bg-secondary border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="header">Header</SelectItem>
                <SelectItem value="query">Query Params</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  )
}
