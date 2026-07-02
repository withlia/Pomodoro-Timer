declare global {
  interface Window {
    pixelPomodoro?: {
      getPlatform: () => Promise<string>
      notify: (payload: { title: string; body: string }) => Promise<void>
      getBlockerStatus: () => Promise<{
        hostBlockingReady: boolean
        appBlockingReady: boolean
        requiresAdmin: boolean
      }>
    }
  }
}

export {}
