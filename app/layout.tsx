import type { Metadata } from 'next'
import { AuthProvider } from '@/lib/auth/auth-context'
import { ZoomHandler } from '@/components/zoom-handler'
import './globals.css'

export const metadata: Metadata = {
  title: 'Quence',
  description: 'A lightweight API testing tool',
  generator: 'v0.app',
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="bg-background">
      <body className="font-sans antialiased overflow-hidden">
        <AuthProvider>
          <ZoomHandler />
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
