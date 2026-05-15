export interface User {
  id: string
  email: string
  name: string
}

export interface AuthSession {
  user: User
  token: string
}

export type AuthState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'authenticated'; session: AuthSession }
