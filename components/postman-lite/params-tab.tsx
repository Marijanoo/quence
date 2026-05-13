'use client'

import type { KeyValuePair } from '@/lib/db/types'
import { KeyValueEditor } from './key-value-editor'

interface ParamsTabProps {
  params: KeyValuePair[]
  onChange: (params: KeyValuePair[]) => void
}

export function ParamsTab({ params, onChange }: ParamsTabProps) {
  return (
    <div className="p-4">
      <KeyValueEditor
        pairs={params}
        onChange={onChange}
        showDescription
        keyPlaceholder="Parameter"
        valuePlaceholder="Value"
      />
    </div>
  )
}
