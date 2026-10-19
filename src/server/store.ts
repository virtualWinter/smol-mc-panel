import 'server-only'
import { NetworkRuntime } from './runtime'
import { prepareStorage } from './storage'
import { requireAdmin } from './request-context'
import { initDatabase } from './db'
import { migrateStorage, setDataRoot } from './doc-store'

const globalStore = globalThis as typeof globalThis & {
  networkRuntime?: NetworkRuntime
  networkRuntimePending?: Promise<NetworkRuntime>
  panelStorageRoot?: string
}

export function dataRoot() {
  return globalStore.panelStorageRoot ??= prepareStorage(process.cwd(), process.env.PANEL_DATA_DIR)
}

async function createRuntime(): Promise<NetworkRuntime> {
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
  return network
}

export async function runtime(): Promise<NetworkRuntime> {
  requireAdmin()
  if (globalStore.networkRuntime) return globalStore.networkRuntime
  // Share one initialization between concurrent requests so the database is
  // connected and storage migrated exactly once. A failure clears the cached
  // promise so a later request can retry.
  globalStore.networkRuntimePending ??= createRuntime().catch((error) => {
    globalStore.networkRuntimePending = undefined
    throw error
  })
  return globalStore.networkRuntimePending
}

export async function snapshot(url: string) { return (await runtime()).snapshot(url) }
