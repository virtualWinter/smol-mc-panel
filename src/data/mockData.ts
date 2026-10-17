import type { Server, ServerFile, Backup } from '../types'

export const proxy = {
  id: 'proxy', name: 'Proxy', address: 'play.example.com:25565',
  status: 'Online', memory: '256 MB / 1 GB', players: '3 / 100', cpu: '1%',
  logs: ['[INFO] Starting Velocity proxy...', '[INFO] Listening on 0.0.0.0:25565', '[INFO] Connected to backend servers.'],
}

export const servers = [
  {
    id: 'survival', name: 'Survival', address: '127.0.0.1:25566', status: 'Online',
    memory: '2.4 / 4 GB', players: '3 / 20', cpu: '12%',
    logs: ['[INFO] Starting Minecraft server...', '[INFO] Preparing level "world"', '[INFO] Done! For help, type "help"'],
  },
  {
    id: 'creative', name: 'Creative', address: '127.0.0.1:25567', status: 'Offline',
    memory: '0 / 2 GB', players: '0 / 10', cpu: '0%',
    logs: ['[INFO] Saving worlds...', '[INFO] Server stopped.'],
  },
]

export const javaVersions = ['Java 25', 'Java 21', 'Java 17']

export const networkServers: Server[] = [proxy, ...servers].map((server) => ({
  ...server,
  javaVersion: 'Java 21',
  jarFile: server.id === 'proxy' ? 'velocity.jar' : 'server.jar',
  startupCommand: 'java -Xms{{MIN_MEMORY}}M -Xmx{{MAX_MEMORY}}M -jar {{JAR_FILE}} nogui',
  minMemory: server.id === 'proxy' ? 256 : 512,
  maxMemory: server.id === 'proxy' ? 1024 : server.id === 'survival' ? 4096 : 2048,
  workingDirectory: `servers/${server.id}`,
  stopCommand: server.id === 'proxy' ? 'shutdown' : 'stop',
  autoStart: true,
  restartOnCrash: true,
}))

export const serverFiles: Record<string, ServerFile[]> = {
  proxy: [
    { name: 'plugins', size: '—', directory: true },
    { name: 'velocity.toml', size: '4 KB' },
    { name: 'forwarding.secret', size: '32 B' },
  ],
  survival: [
    { name: 'plugins', size: '—', directory: true },
    { name: 'world', size: '—', directory: true },
    { name: 'server.properties', size: '2 KB' },
    { name: 'server.jar', size: '48 MB' },
  ],
  creative: [
    { name: 'plugins', size: '—', directory: true },
    { name: 'world', size: '—', directory: true },
    { name: 'server.properties', size: '2 KB' },
    { name: 'server.jar', size: '48 MB' },
  ],
}

export const serverBackups: Record<string, Backup[]> = {
  proxy: [],
  survival: [{ id: 'survival-1', name: 'Daily backup', created: '2026-10-17 04:00 UTC', size: '128 MB' }],
  creative: [],
}

export interface MetricHistory {
  cpu: number[]
  ram: number[]
  players: number[]
  tps: number[]
  network?: number[]
}

export const metricHistory: Record<string, MetricHistory> = {
  proxy: {
    cpu: [1, 1.2, 0.8, 1.4, 1, 2, 1.5, 1.2, 0.9, 1.1, 1.3, 1],
    ram: [220, 224, 228, 230, 235, 232, 240, 244, 248, 250, 254, 256],
    players: [1, 1, 2, 2, 2, 3, 3, 4, 4, 3, 3, 3],
    tps: [],
    network: [24, 30, 28, 45, 38, 52, 48, 65, 58, 44, 40, 42],
  },
  survival: {
    cpu: [8, 10, 9, 15, 12, 18, 14, 11, 16, 13, 10, 12],
    ram: [2100, 2150, 2200, 2250, 2180, 2280, 2320, 2380, 2300, 2380, 2420, 2458],
    players: [1, 1, 2, 2, 2, 3, 3, 4, 4, 3, 3, 3],
    tps: [20, 20, 19.9, 20, 19.8, 19.6, 19.9, 20, 19.8, 20, 20, 20],
  },
  creative: { cpu: Array(12).fill(0), ram: Array(12).fill(0), players: Array(12).fill(0), tps: Array(12).fill(0) },
}
