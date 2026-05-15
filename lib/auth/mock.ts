import type { AuthSession } from './types'

const SESSION_KEY = 'postman-lite-session'

function emailToId(email: string): string {
  let hash = 0
  for (let i = 0; i < email.length; i++) {
    hash = (Math.imul(31, hash) + email.charCodeAt(i)) | 0
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0')
  return `user-${hex}-${email.length.toString(16).padStart(4, '0')}`
}

async function callDb() {
  if (typeof window === 'undefined' || !window.electronAPI?.db) {
    throw new Error('Database not available')
  }
  return window.electronAPI.db
}

export async function mockLogin(email: string, password: string): Promise<AuthSession> {
  const db = await callDb()
  // user.id comes from Postgres — use it directly, not the hash
  const user = await db.auth.login(email.toLowerCase(), password)
  const session: AuthSession = { user, token: user.id }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return session
}

export async function mockRegister(email: string, password: string, name: string): Promise<AuthSession> {
  const db = await callDb()
  const key = email.toLowerCase()
  const id = emailToId(key)
  const user = await db.auth.register(id, key, name, password)
  const session: AuthSession = { user, token: id }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return session
}

export function mockLogout(): void {
  localStorage.removeItem(SESSION_KEY)
}

export function loadSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (raw) return JSON.parse(raw) as AuthSession
  } catch {}
  return null
}
