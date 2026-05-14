'use client'

import type { BodyType, KeyValuePair } from '@/lib/db/types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { KeyValueEditor } from './key-value-editor'
import { VariableHighlightTextarea } from './variable-highlight-textarea'
import { useEnvironmentContext } from './environment-context'
import { Button } from '@/components/ui/button'
import { Sparkles, Wand2 } from 'lucide-react'

interface BodyTabProps {
  bodyType: BodyType
  content: string
  formData?: KeyValuePair[]
  onTypeChange: (type: BodyType) => void
  onContentChange: (content: string) => void
  onFormDataChange: (formData: KeyValuePair[]) => void
}

const bodyTypes: { value: BodyType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'json', label: 'JSON' },
  { value: 'form-data', label: 'Form Data' },
  { value: 'x-www-form-urlencoded', label: 'x-www-form-urlencoded' },
  { value: 'raw', label: 'Raw' },
]

export function BodyTab({
  bodyType,
  content,
  formData = [],
  onTypeChange,
  onContentChange,
  onFormDataChange,
}: BodyTabProps) {
  const { variables, updateVariable } = useEnvironmentContext()

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-4 pb-2 shrink-0">
        <Select value={bodyType} onValueChange={(v) => onTypeChange(v as BodyType)}>
          <SelectTrigger className="w-[200px] bg-secondary border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {bodyTypes.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {bodyType === 'json' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              try {
                const parsed = JSON.parse(content)
                onContentChange(JSON.stringify(parsed, null, 2))
              } catch (e) {
                // invalid JSON — keep as-is
              }
            }}
            className="h-9 px-3 gap-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10"
          >
            <Wand2 className="h-3.5 w-3.5" />
            <span className="text-xs">Beautify</span>
          </Button>
        )}
      </div>

      {bodyType === 'none' && (
        <p className="text-muted-foreground text-sm px-4">
          This request does not have a body.
        </p>
      )}

      {(bodyType === 'json' || bodyType === 'raw') && (
        <div className="flex-1 min-h-0 px-4 pb-4">
          <VariableHighlightTextarea
            value={content}
            onChange={onContentChange}
            placeholder={bodyType === 'json' ? '{\n  "key": "value"\n}' : 'Raw body content'}
            variables={variables}
            onUpdateVariable={updateVariable}
            language={bodyType === 'json' ? 'json' : 'text'}
            className="h-full"
          />
        </div>
      )}

      {(bodyType === 'form-data' || bodyType === 'x-www-form-urlencoded') && (
        <div className="flex-1 min-h-0 overflow-auto px-4 pb-4">
          <KeyValueEditor
            pairs={formData}
            onChange={onFormDataChange}
            keyPlaceholder="Key"
            valuePlaceholder="Value"
            allowFiles={bodyType === 'form-data'}
          />
        </div>
      )}
    </div>
  )
}
