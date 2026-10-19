import 'server-only'
import { NetworkRuntime } from './runtime'
import { prepareStorage } from './storage'
import { requireAdmin } from './request-context'
import { initDatabase, isDatabaseReady } from './db'
import { migrateStorage, setDataRoot } from './doc-store'

const globalStore = globalThis as typeof globalThis & { networkRuntime?: NetworkRuntime; panelStorageRoot?: string }

export function dataRoot() {
  return globalStore.panelStorageRoot ??= prepareStorage(process.cwd(), process.env.PANEL_DATA_DIR)
}

export async function runtime(): Promise<NetworkRuntime> {
  requireAdmin()
  if (!globalStore.networkRuntime) {
    const root = dataRoot()
    setDataRoot(root)
    await initDatabase()
    await migrateStorage(root)
    const network = new NetworkRuntime(root)
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
  return globalStore.networkRuntime!
}

export async function snapshot(url: string) { return (await runtime()).snapshot(url) }
