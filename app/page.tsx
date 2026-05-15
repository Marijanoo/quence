'use client'

import { useAuth } from '@/lib/auth/auth-context'
import { LoginScreen } from '@/components/postman-lite/login-screen'
import { PostmanLite } from '@/components/postman-lite/postman-lite'

export default function Home() {
  const { state } = useAuth()

  if (state.status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <span className="text-sm text-muted-foreground">Loading…</span>
      </div>
    )
  }

  if (state.status === 'unauthenticated') {
    return <LoginScreen />
  }

  return <PostmanLite />
}
