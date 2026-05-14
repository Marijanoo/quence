export {}

declare global {
  interface Window {
    electronAPI?: {
      makeRequest: (options: any) => Promise<any>
      minimize: () => void
      maximize: () => void
      close: () => void
      wsConnect: (socketId: string, url: string, headers?: Record<string, string>) => void
      wsSend: (socketId: string, data: string) => void
      wsDisconnect: (socketId: string) => void
      wsOnOpen: (cb: (socketId: string) => void) => void
      wsOnMessage: (cb: (socketId: string, data: string, isBinary: boolean) => void) => void
      wsOnClose: (cb: (socketId: string, code: number, reason: string) => void) => void
      wsOnError: (cb: (socketId: string, message: string) => void) => void
      wsRemoveListeners: () => void
    }
  }
}
