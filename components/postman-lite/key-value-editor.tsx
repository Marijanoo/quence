'use client'

import { useRef } from 'react'
import { Plus, Trash2, FileUp, X } from 'lucide-react'
import type { KeyValuePair } from '@/lib/db/types'
import { createKeyValuePair } from '@/lib/db/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { VariableHighlightInput } from './variable-highlight-input'
import { useEnvironmentContext } from './environment-context'
import { cn } from '@/lib/utils'

interface KeyValueEditorProps {
  pairs: KeyValuePair[]
  onChange: (pairs: KeyValuePair[]) => void
  showDescription?: boolean
  keyPlaceholder?: string
  valuePlaceholder?: string
  highlightVariables?: boolean
  allowFiles?: boolean
  readOnly?: boolean
}

export function KeyValueEditor({
  pairs,
  onChange,
  showDescription = false,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
  highlightVariables = true,
  allowFiles = false,
  readOnly = false,
}: KeyValueEditorProps) {
  const { variables, updateVariable } = useEnvironmentContext()
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const handleAdd = () => {
    onChange([...pairs, createKeyValuePair()])
  }

  const handleRemove = (id: string) => {
    onChange(pairs.filter((p) => p.id !== id))
  }

  const handleUpdate = (id: string, field: keyof KeyValuePair, value: unknown) => {
    onChange(pairs.map((p) => (p.id === id ? { ...p, [field]: value } : p)))
  }

  const handleFileChange = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1]
      onChange(pairs.map(p => p.id === id ? {
        ...p,
        value: file.name,
        fileData: { name: file.name, base64, mimeType: file.type || 'application/octet-stream' },
      } : p))
    }
    reader.readAsDataURL(file)
  }

  const handleClearFile = (id: string) => {
    onChange(pairs.map(p => p.id === id ? { ...p, value: '', fileData: undefined } : p))
    const ref = fileInputRefs.current[id]
    if (ref) ref.value = ''
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium px-1">
        <div className="w-6" />
        {allowFiles && <div className="w-16" />}
        <div className="flex-1">{keyPlaceholder}</div>
        <div className="flex-1">{valuePlaceholder}</div>
        {showDescription && <div className="flex-1">Description</div>}
        <div className="w-8" />
      </div>

      {/* Pairs */}
      {pairs.map((pair) => {
        const isFile = allowFiles && pair.type === 'file'
        return (
          <div key={pair.id} className="flex items-center gap-2">
            <Checkbox
              checked={pair.enabled}
              onCheckedChange={readOnly ? undefined : (checked) => handleUpdate(pair.id, 'enabled', !!checked)}
              disabled={readOnly}
              className="border-border"
            />

            {/* Type toggle */}
            {allowFiles && (
              <div className="flex rounded border border-border overflow-hidden shrink-0">
                <button
                  onClick={readOnly ? undefined : () => handleUpdate(pair.id, 'type', 'text')}
                  disabled={readOnly}
                  className={cn(
                    'px-2 py-1 text-xs transition-colors',
                    !isFile ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary',
                    readOnly && 'cursor-default'
                  )}
                >
                  Text
                </button>
                <button
                  onClick={readOnly ? undefined : () => handleUpdate(pair.id, 'type', 'file')}
                  disabled={readOnly}
                  className={cn(
                    'px-2 py-1 text-xs transition-colors',
                    isFile ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary',
                    readOnly && 'cursor-default'
                  )}
                >
                  File
                </button>
              </div>
            )}

            {/* Key */}
            <div className="flex-1">
              {highlightVariables ? (
                <VariableHighlightInput
                  value={pair.key}
                  onChange={(v) => handleUpdate(pair.id, 'key', v)}
                  placeholder={keyPlaceholder}
                  className="h-8 bg-secondary border-border"
                  variables={variables}
                  onUpdateVariable={updateVariable}
                  readOnly={readOnly}
                />
              ) : (
                <Input
                  value={pair.key}
                  onChange={(e) => handleUpdate(pair.id, 'key', e.target.value)}
                  placeholder={keyPlaceholder}
                  className="h-8 bg-secondary border-border text-sm font-mono"
                  readOnly={readOnly}
                />
              )}
            </div>

            {/* Value or file picker */}
            <div className="flex-1">
              {isFile ? (
                <div className="flex items-center gap-1">
                  {!readOnly && (
                    <input
                      ref={el => { fileInputRefs.current[pair.id] = el }}
                      type="file"
                      className="hidden"
                      onChange={(e) => handleFileChange(pair.id, e)}
                    />
                  )}
                  {pair.fileData ? (
                    <div className="flex items-center gap-1 flex-1 h-8 px-2 rounded border border-border bg-secondary text-xs text-foreground overflow-hidden">
                      <span className="truncate flex-1">{pair.fileData.name}</span>
                      {!readOnly && (
                        <button onClick={() => handleClearFile(pair.id)} className="shrink-0 text-muted-foreground hover:text-destructive">
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ) : readOnly ? (
                    <div className="flex items-center gap-1 flex-1 h-8 px-2 rounded border border-border bg-secondary text-xs text-muted-foreground overflow-hidden">
                      No file
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 flex-1 text-xs text-muted-foreground border-border bg-secondary hover:text-foreground"
                      onClick={() => fileInputRefs.current[pair.id]?.click()}
                    >
                      <FileUp className="h-3.5 w-3.5 mr-1" />
                      Choose file
                    </Button>
                  )}
                </div>
              ) : highlightVariables ? (
                <VariableHighlightInput
                  value={pair.value}
                  onChange={(v) => handleUpdate(pair.id, 'value', v)}
                  placeholder={valuePlaceholder}
                  className="h-8 bg-secondary border-border"
                  variables={variables}
                  onUpdateVariable={updateVariable}
                  readOnly={readOnly}
                />
              ) : (
                <Input
                  value={pair.value}
                  onChange={(e) => handleUpdate(pair.id, 'value', e.target.value)}
                  placeholder={valuePlaceholder}
                  className="h-8 bg-secondary border-border text-sm font-mono"
                  readOnly={readOnly}
                />
              )}
            </div>

            {showDescription && (
              <Input
                value={pair.description || ''}
                onChange={(e) => handleUpdate(pair.id, 'description', e.target.value)}
                placeholder="Description"
                className="flex-1 h-8 bg-secondary border-border text-sm"
                readOnly={readOnly}
              />
            )}
            {!readOnly && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleRemove(pair.id)}
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            {readOnly && <div className="h-8 w-8 shrink-0" />}
          </div>
        )
      })}

      {!readOnly && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleAdd}
          className="text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      )}
    </div>
  )
}
