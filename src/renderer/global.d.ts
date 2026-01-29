declare global {
  interface Window {
    App: {
      sayHelloFromBridge: () => void
      username?: string
      windowControls: {
        minimize: () => Promise<void>
        toggleMaximize: () => Promise<boolean>
        close: () => Promise<void>
      }
    }
  }
}

export {}
