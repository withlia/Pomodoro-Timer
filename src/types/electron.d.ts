declare global {
  interface Window {
    pixelPomodoro?: {
      getPlatform: () => Promise<string>
      notify: (payload: { title: string; body: string }) => Promise<void>
      getBlockerStatus: () => Promise<{
        hostBlockingReady: boolean
        appBlockingReady: boolean
        requiresAdmin: boolean
        hostsPath: string
      }>
      applyHostBlock: (domains: string[]) => Promise<{ ok: boolean; entries: number; hostsPath: string }>
      clearHostBlock: () => Promise<{ ok: boolean; hostsPath: string }>
    }
  }
}

export {}
