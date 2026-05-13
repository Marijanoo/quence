export {}

declare global {
  interface Window {
    electronAPI?: {
      makeRequest: (options: any) => Promise<any>
      minimize: () => void
      maximize: () => void
      close: () => void
    }
  }
}
