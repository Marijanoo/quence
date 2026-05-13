'use client'

import { Plus, Trash2 } from 'lucide-react'
import type { KeyValuePair } from '@/lib/db/types'
import { createKeyValuePair } from '@/lib/db/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { VariableHighlightInput } from './variable-highlight-input'
import { useEnvironmentContext } from './environment-context'

interface KeyValueEditorProps {
  pairs: KeyValuePair[]
  onChange: (pairs: KeyValuePair[]) => void
  showDescription?: boolean
  keyPlaceholder?: string
  valuePlaceholder?: string
  highlightVariables?: boolean
}

export function KeyValueEditor({
  pairs,
  onChange,
  showDescription = false,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
  highlightVariables = true,
}: KeyValueEditorProps) {
  const { variables, updateVariable } = useEnvironmentContext()

  const handleAdd = () => {
    onChange([...pairs, createKeyValuePair()])
  }

  const handleRemove = (id: string) => {
    onChange(pairs.filter((p) => p.id !== id))
  }

  const handleUpdate = (id: string, field: keyof KeyValuePair, value: string | boolean) => {
    onChange(
      pairs.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    )
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium px-1">
        <div className="w-6" />
        <div className="flex-1">{keyPlaceholder}</div>
        <div className="flex-1">{valuePlaceholder}</div>
        {showDescription && <div className="flex-1">Description</div>}
        <div className="w-8" />
      </div>

      {/* Pairs */}
      {pairs.map((pair) => (
        <div key={pair.id} className="flex items-center gap-2">
          <Checkbox
            checked={pair.enabled}
            onCheckedChange={(checked) => handleUpdate(pair.id, 'enabled', !!checked)}
            className="border-border"
          />
          {highlightVariables ? (
            <>
              <div className="flex-1">
                <VariableHighlightInput
                  value={pair.key}
                  onChange={(v) => handleUpdate(pair.id, 'key', v)}
                  placeholder={keyPlaceholder}
                  className="h-8 bg-secondary border-border"
                  variables={variables}
                  onUpdateVariable={updateVariable}
                />
              </div>
              <div className="flex-1">
                <VariableHighlightInput
                  value={pair.value}
                  onChange={(v) => handleUpdate(pair.id, 'value', v)}
                  placeholder={valuePlaceholder}
                  className="h-8 bg-secondary border-border"
                  variables={variables}
                  onUpdateVariable={updateVariable}
                />
              </div>
            </>
          ) : (
            <>
              <Input
                value={pair.key}
                onChange={(e) => handleUpdate(pair.id, 'key', e.target.value)}
                placeholder={keyPlaceholder}
                className="flex-1 h-8 bg-secondary border-border text-sm font-mono"
              />
              <Input
                value={pair.value}
                onChange={(e) => handleUpdate(pair.id, 'value', e.target.value)}
                placeholder={valuePlaceholder}
                className="flex-1 h-8 bg-secondary border-border text-sm font-mono"
              />
            </>
          )}
          {showDescription && (
            <Input
              value={pair.description || ''}
              onChange={(e) => handleUpdate(pair.id, 'description', e.target.value)}
              placeholder="Description"
              className="flex-1 h-8 bg-secondary border-border text-sm"
            />
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleRemove(pair.id)}
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}

      {/* Add button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleAdd}
        className="text-muted-foreground hover:text-foreground"
      >
        <Plus className="h-4 w-4 mr-1" />
        Add
      </Button>
    </div>
  )
}
