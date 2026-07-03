declare global {
  interface Window {
    pixelPomodoro?: {
      getPlatform: () => Promise<string>
      notify: (payload: { title: string; body: string }) => Promise<void>
      selectApp: () => Promise<{ filePath: string; name: string; processName: string } | null>
      getBlockerStatus: () => Promise<{
        hostBlockingReady: boolean
        appBlockingReady: boolean
        requiresAdmin: boolean
        hostsPath: string
      }>
      applyHostBlock: (payload: { domains: string[]; redirectUrl?: string }) => Promise<{ ok: boolean; entries: number; hostsPath: string; redirectReady: boolean; redirectUrl: string }>
      clearHostBlock: () => Promise<{ ok: boolean; hostsPath: string }>
      applyAppBlock: (processNames: string[]) => Promise<{ ok: boolean; targets: number }>
      clearAppBlock: () => Promise<{ ok: boolean }>
      onAppKilled?: (handler: (payload: { processName: string; at: number }) => void) => () => void
      onSiteHit?: (handler: (payload: { domain: string; at: number; redirected: boolean }) => void) => () => void
    }
  }
}

export {}
