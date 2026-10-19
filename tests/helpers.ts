import { createHash } from 'node:crypto'
import { proxyConfig, type ServerConfig } from '../src/server/config'

/** Deterministic fixture UUIDs keep tests readable while still using UUID-named directories. */
export function testUuid(id: string) {
  const hex = createHash('sha256').update(`smol-mc-panel-test/${id}`).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

export function testDirectory(id: string) {
  return `servers/${testUuid(id)}`
}

// Explicit test fixtures only. Production never creates these sample backends.
export function defaults(): ServerConfig[] {
  return [{ ...proxyConfig(), uuid: testUuid('proxy'), workingDirectory: testDirectory('proxy') }, ...[
    { id: 'survival', name: 'Survival', port: 25566, memory: 4096 },
    { id: 'creative', name: 'Creative', port: 25567, memory: 2048 },
  ].map(({ id, name, port, memory }): ServerConfig => {
    const uuid = testUuid(id)
    return {
      ...proxyConfig(), uuid, id, name, kind: 'paper', address: `127.0.0.1:${port}`, workingDirectory: testDirectory(id),
      jarFile: 'server.jar', startupCommand: 'java -Xms{{MIN_MEMORY}}M -Xmx{{MAX_MEMORY}}M -jar {{JAR_FILE}} nogui',
      maxMemory: memory, stopCommand: 'stop',
    }
  })]
}
