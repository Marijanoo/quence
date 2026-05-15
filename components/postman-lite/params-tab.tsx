'use client'

import type { KeyValuePair } from '@/lib/db/types'
import { KeyValueEditor } from './key-value-editor'

interface ParamsTabProps {
  params: KeyValuePair[]
  onChange: (params: KeyValuePair[]) => void
  readOnly?: boolean
}

export function ParamsTab({ params, onChange, readOnly }: ParamsTabProps) {
  return (
    <div className="p-4">
      <KeyValueEditor
        pairs={params}
        onChange={onChange}
        showDescription
        keyPlaceholder="Parameter"
        valuePlaceholder="Value"
        readOnly={readOnly}
      />
    </div>
  )
}
