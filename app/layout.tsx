import type { Metadata } from 'next'
import { AuthProvider } from '@/lib/auth/auth-context'
import { ZoomHandler } from '@/components/zoom-handler'
import './globals.css'

export const metadata: Metadata = {
  title: 'Postman Lite',
  description: 'A lightweight API testing tool',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
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
