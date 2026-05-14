'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { generateId } from '@/lib/utils'
import type { Environment, EnvironmentVariable } from '@/lib/db/types'

interface EnvironmentContextValue {
  activeEnvironment?: Environment
  variables: EnvironmentVariable[]
  updateVariable: (key: string, value: string) => void
}

const EnvironmentContext = createContext<EnvironmentContextValue>({
  variables: [],
  updateVariable: () => {},
})

export function useEnvironmentContext() {
  return useContext(EnvironmentContext)
}

interface EnvironmentProviderProps {
  children: ReactNode
  activeEnvironment?: Environment
  onUpdateEnvironment: (id: string, data: Partial<Environment>) => void
}

export function EnvironmentProvider({
  children,
  activeEnvironment,
  onUpdateEnvironment,
}: EnvironmentProviderProps) {
  const variables = activeEnvironment?.variables || []

  const updateVariable = (key: string, newValue: string) => {
    if (!activeEnvironment) return

    const existingVarIndex = activeEnvironment.variables.findIndex((v) => v.key === key)

    let updatedVariables: EnvironmentVariable[]

    if (existingVarIndex >= 0) {
      // Update existing variable
      updatedVariables = activeEnvironment.variables.map((v, idx) =>
        idx === existingVarIndex ? { ...v, value: newValue } : v
      )
    } else {
      // Add new variable
      updatedVariables = [
        ...activeEnvironment.variables,
        {
          id: generateId(),
          key,
          value: newValue,
          enabled: true,
        },
      ]
    }

    onUpdateEnvironment(activeEnvironment.id, { variables: updatedVariables })
  }

  return (
    <EnvironmentContext.Provider
      value={{
        activeEnvironment,
        variables,
        updateVariable,
      }}
    >
      {children}
    </EnvironmentContext.Provider>
  )
}
