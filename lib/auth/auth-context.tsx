'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { AuthState, AuthSession } from './types'
import { mockLogin, mockRegister, mockLogout, loadSession } from './mock'

interface AuthContextValue {
  state: AuthState
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? 'https://quence.kolaj.fun'
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  useEffect(() => {
    async function init() {
      const session = loadSession()
      if (!session) {
        setState({ status: 'unauthenticated' })
        return
      }
      try {
        const res = await fetch(`${apiBase()}/auth/me`, {
          headers: { Authorization: `Bearer ${session.token}` },
        })
        if (res.ok) {
          setState({ status: 'authenticated', session })
        } else {
          mockLogout()
          setState({ status: 'unauthenticated' })
        }
      } catch {
        // Network offline — trust the cached session
        setState({ status: 'authenticated', session })
      }
    }
    init()
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const session = await mockLogin(email, password)
    setState({ status: 'authenticated', session })
  }, [])

  const register = useCallback(async (email: string, password: string, name: string) => {
    const session = await mockRegister(email, password, name)
    setState({ status: 'authenticated', session })
  }, [])

  const logout = useCallback(() => {
    mockLogout()
    // Reset the DB singleton so the next login gets a fresh adapter with the new userId
    import('@/lib/db').then(({ resetDatabase }) => resetDatabase())
    setState({ status: 'unauthenticated' })
  }, [])

  return (
    <AuthContext.Provider value={{ state, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
