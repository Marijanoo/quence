'use client'

import type { KeyValuePair } from '@/lib/db/types'
import { KeyValueEditor } from './key-value-editor'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus } from 'lucide-react'
import { createKeyValuePair } from '@/lib/db/types'

interface HeadersTabProps {
  headers: KeyValuePair[]
  onChange: (headers: KeyValuePair[]) => void
  readOnly?: boolean
}

const commonHeaders = [
  { key: 'Content-Type', value: 'application/json' },
  { key: 'Accept', value: 'application/json' },
  { key: 'Authorization', value: 'Bearer ' },
  { key: 'Cache-Control', value: 'no-cache' },
  { key: 'User-Agent', value: 'Postman Lite' },
]

export function HeadersTab({ headers, onChange, readOnly }: HeadersTabProps) {
  const addCommonHeader = (header: { key: string; value: string }) => {
    const newHeader = createKeyValuePair(header.key, header.value)
    onChange([...headers, newHeader])
  }

  return (
    <div className="p-4">
      {!readOnly && (
        <div className="flex items-center justify-between mb-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="text-xs">
                <Plus className="h-3 w-3 mr-1" />
                Common Headers
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {commonHeaders.map((header) => (
                <DropdownMenuItem
                  key={header.key}
                  onClick={() => addCommonHeader(header)}
                  className="font-mono text-xs"
                >
                  {header.key}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <KeyValueEditor
        pairs={headers}
        onChange={onChange}
        showDescription
        keyPlaceholder="Header"
        valuePlaceholder="Value"
        readOnly={readOnly}
      />
    </div>
  )
}
