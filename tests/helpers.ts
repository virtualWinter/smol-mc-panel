import { proxyConfig, type ServerConfig } from '../src/server/config'

// Explicit test fixtures only. Production never creates these sample backends.
export function defaults(): ServerConfig[] {
  return [proxyConfig('velocity'), ...[
    { id: 'survival', name: 'Survival', port: 25566, memory: 4096 },
    { id: 'creative', name: 'Creative', port: 25567, memory: 2048 },
  ].map(({ id, name, port, memory }): ServerConfig => ({ ...proxyConfig('velocity'), id, name, kind: 'paper', address: `127.0.0.1:${port}`, workingDirectory: `servers/${id}`, jarFile: 'server.jar', startupCommand: 'java -Xms{{MIN_MEMORY}}M -Xmx{{MAX_MEMORY}}M -jar {{JAR_FILE}} nogui', maxMemory: memory, stopCommand: 'stop' }))]
}
