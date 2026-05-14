'use client'

import { useState, useRef } from 'react'
import { generateId } from '@/lib/utils'
import type { Environment, EnvironmentVariable } from '@/lib/db/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Settings,
  Plus,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Trash2,
  Check,
  FileUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface EnvironmentsPanelProps {
  environments: Environment[]
  activeEnvironment?: Environment
  onCreateEnvironment: (name: string) => void
  onImportEnvironment: (env: Environment) => void
  onDeleteEnvironment: (id: string) => void
  onUpdateEnvironment: (id: string, data: Partial<Environment>) => void
  onSetActive: (id: string | null) => void
}

export function EnvironmentsPanel({
  environments,
  activeEnvironment,
  onCreateEnvironment,
  onImportEnvironment,
  onDeleteEnvironment,
  onUpdateEnvironment,
  onSetActive,
}: EnvironmentsPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [expandedEnvs, setExpandedEnvs] = useState<Set<string>>(new Set())
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false)
  const [selectedEnv, setSelectedEnv] = useState<Environment | null>(null)
  const [inputValue, setInputValue] = useState('')

  const toggleEnv = (id: string) => {
    const newExpanded = new Set(expandedEnvs)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedEnvs(newExpanded)
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const content = JSON.parse(event.target?.result as string)
        let name = file.name.replace('.json', '')
        let variables: EnvironmentVariable[] = []

        // Handle Postman Environment export format
        if (content.name && Array.isArray(content.values)) {
          name = content.name
          variables = content.values.map((v: any) => ({
            id: generateId(),
            key: v.key || '',
            value: v.value || '',
            enabled: v.enabled !== false,
          }))
        } 
        // Handle simple key-value object
        else if (typeof content === 'object' && !Array.isArray(content)) {
          variables = Object.entries(content).map(([key, value]) => ({
            id: generateId(),
            key,
            value: String(value),
            enabled: true,
          }))
        }

        if (variables.length > 0) {
          onImportEnvironment({
            id: generateId(),
            name,
            variables,
            isActive: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          })
        }
      } catch (error) {
        console.error('Failed to import environment:', error)
      }
    }
    reader.readAsText(file)
    e.target.value = '' // Reset input
  }

  const handleCreate = () => {
    if (inputValue.trim()) {
      onCreateEnvironment(inputValue.trim())
      setInputValue('')
      setIsCreateDialogOpen(false)
    }
  }

  const handleRename = () => {
    if (inputValue.trim() && selectedEnv) {
      onUpdateEnvironment(selectedEnv.id, { name: inputValue.trim() })
      setInputValue('')
      setSelectedEnv(null)
      setIsRenameDialogOpen(false)
    }
  }

  const openRenameDialog = (env: Environment) => {
    setSelectedEnv(env)
    setInputValue(env.name)
    setIsRenameDialogOpen(true)
  }

  const addVariable = (envId: string, variables: EnvironmentVariable[]) => {
    const newVar: EnvironmentVariable = {
      id: generateId(),
      key: '',
      value: '',
      enabled: true,
    }
    onUpdateEnvironment(envId, { variables: [...variables, newVar] })
  }

  const updateVariable = (
    envId: string,
    variables: EnvironmentVariable[],
    varId: string,
    field: keyof EnvironmentVariable,
    value: string | boolean
  ) => {
    const updated = variables.map((v) =>
      v.id === varId ? { ...v, [field]: value } : v
    )
    onUpdateEnvironment(envId, { variables: updated })
  }

  const deleteVariable = (envId: string, variables: EnvironmentVariable[], varId: string) => {
    onUpdateEnvironment(envId, { variables: variables.filter((v) => v.id !== varId) })
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <h3 className="text-sm font-medium text-foreground">Environments</h3>
        <div className="flex items-center gap-1">
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".json"
            onChange={handleImport}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => fileInputRef.current?.click()}
            title="Import environment"
          >
            <FileUp className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setIsCreateDialogOpen(true)}
            title="New environment"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {environments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <Settings className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-xs">No environments yet</p>
          </div>
        ) : (
          <div className="py-1">
            {environments.map((env) => {
              const isExpanded = expandedEnvs.has(env.id)
              const isActive = activeEnvironment?.id === env.id

              return (
                <Collapsible
                  key={env.id}
                  open={isExpanded}
                  onOpenChange={() => toggleEnv(env.id)}
                >
                  <div className="group flex items-center hover:bg-secondary/50">
                    <CollapsibleTrigger className="flex items-center flex-1 px-3 py-1.5 text-sm">
                      <ChevronRight
                        className={cn(
                          'h-4 w-4 mr-1 transition-transform text-muted-foreground',
                          isExpanded && 'rotate-90'
                        )}
                      />
                      <Settings className={cn('h-4 w-4 mr-2', isActive ? 'text-primary' : 'text-muted-foreground')} />
                      <span className={cn('truncate', isActive && 'text-primary font-medium')}>
                        {env.name}
                      </span>
                      {isActive && (
                        <Check className="h-3 w-3 ml-2 text-primary" />
                      )}
                    </CollapsibleTrigger>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 mr-1"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onSetActive(isActive ? null : env.id)}>
                          <Check className="h-4 w-4 mr-2" />
                          {isActive ? 'Deactivate' : 'Set Active'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openRenameDialog(env)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onDeleteEnvironment(env.id)}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <CollapsibleContent>
                    <div className="pl-8 pr-2 py-2 space-y-2">
                      {env.variables.map((variable) => (
                        <div key={variable.id} className="flex items-center gap-2">
                          <Checkbox
                            checked={variable.enabled}
                            onCheckedChange={(checked) =>
                              updateVariable(env.id, env.variables, variable.id, 'enabled', !!checked)
                            }
                          />
                          <Input
                            value={variable.key}
                            onChange={(e) =>
                              updateVariable(env.id, env.variables, variable.id, 'key', e.target.value)
                            }
                            placeholder="Variable"
                            className="h-7 text-xs bg-secondary font-mono"
                          />
                          <Input
                            value={variable.value}
                            onChange={(e) =>
                              updateVariable(env.id, env.variables, variable.id, 'value', e.target.value)
                            }
                            placeholder="Value"
                            className="h-7 text-xs bg-secondary font-mono"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0"
                            onClick={() => deleteVariable(env.id, env.variables, variable.id)}
                          >
                            <Trash2 className="h-3 w-3 text-muted-foreground" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-muted-foreground"
                        onClick={() => addVariable(env.id, env.variables)}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add Variable
                      </Button>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )
            })}
          </div>
        )}
      </div>

      {/* Create Environment Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Environment</DialogTitle>
          </DialogHeader>
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Environment name"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Environment Dialog */}
      <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Environment</DialogTitle>
          </DialogHeader>
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Environment name"
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRenameDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRename}>Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
