'use client'

import type { Environment } from '@/lib/db/types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Settings } from 'lucide-react'

interface EnvironmentSelectorProps {
  environments: Environment[]
  activeEnvironment?: Environment
  onSelect: (id: string | null) => void
}

export function EnvironmentSelector({
  environments,
  activeEnvironment,
  onSelect,
}: EnvironmentSelectorProps) {
  return (
    <Select
      value={activeEnvironment?.id || 'none'}
      onValueChange={(v) => onSelect(v === 'none' ? null : v)}
    >
      <SelectTrigger className="w-[180px] h-8 bg-secondary border-border">
        <div className="flex items-center gap-2">
          <Settings className="h-3.5 w-3.5 text-muted-foreground" />
          <SelectValue placeholder="No Environment" />
        </div>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">No Environment</SelectItem>
        {environments.map((env) => (
          <SelectItem key={env.id} value={env.id}>
            {env.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
