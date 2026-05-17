import type { AuthSession } from './types'

const SESSION_KEY = 'quence-session'

function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? 'https://quence.kolaj.fun'
}

async function apiPost<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? `Request failed: ${res.status}`)
  return json as T
}

export async function mockLogin(email: string, password: string): Promise<AuthSession> {
  const { token, user } = await apiPost<{ token: string; user: { id: string; email: string; name: string } }>(
    '/auth/login',
    { email: email.toLowerCase(), password }
  )
  const session: AuthSession = { user, token }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return session
}

export async function mockRegister(email: string, password: string, name: string): Promise<AuthSession> {
  const { token, user } = await apiPost<{ token: string; user: { id: string; email: string; name: string } }>(
    '/auth/register',
    { email: email.toLowerCase(), name, password }
  )
  const session: AuthSession = { user, token }
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
