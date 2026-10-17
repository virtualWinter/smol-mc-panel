import 'server-only'
import { resolve } from 'node:path'
import { NetworkRuntime } from './runtime'

const globalStore = globalThis as typeof globalThis & { networkRuntime?: NetworkRuntime }

export function runtime(): NetworkRuntime {
  if (!globalStore.networkRuntime) {
    const network = new NetworkRuntime(resolve(process.env.PANEL_DATA_DIR || 'network'))
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
