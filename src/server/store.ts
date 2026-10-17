import 'server-only'
import { NetworkRuntime } from './runtime'
import { prepareStorage } from './storage'
import { requireAdmin } from './request-context'

const globalStore = globalThis as typeof globalThis & { networkRuntime?: NetworkRuntime; panelStorageRoot?: string }

export function dataRoot() {
  return globalStore.panelStorageRoot ??= prepareStorage(process.cwd(), process.env.PANEL_DATA_DIR)
}

export function runtime(): NetworkRuntime {
  requireAdmin()
  if (!globalStore.networkRuntime) {
    const network = new NetworkRuntime(dataRoot())
    globalStore.networkRuntime = network
    let stopping = false
    const stop = () => {
      if (stopping) return
      stopping = true
      void network.shutdown().finally(() => process.exit(0))
    }
    process.once('SIGTERM', stop)
    process.once('SIGINT', stop)
  }
  return globalStore.networkRuntime
}

export function snapshot(url: string) { return runtime().snapshot(url) }
