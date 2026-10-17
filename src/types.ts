export interface Server {
  kind: 'velocity' | 'bungeecord' | 'paper'
  installed: boolean
  jarVersion?: string
  download?: DownloadProgressState
  eulaAccepted: boolean
  id: string
  name: string
  address: string
  status: string
  memory: string
  players: string
  cpu: string
  logs: string[]
  logOffset: number
  javaVersion: string
  jarFile: string
  startupCommand: string
  minMemory: number
  maxMemory: number
  workingDirectory: string
  stopCommand: string
  autoStart: boolean
  restartOnCrash: boolean
}

export interface ServerProps { server: Server }
export interface ServerFile { name: string; size: string; directory?: boolean; modified?: string }
export interface Backup { id: string; name: string; created: string; size: string }

export interface DownloadProgressState {
  phase: 'resolving' | 'downloading' | 'verifying' | 'extracting' | 'installing' | 'complete' | 'failed'
  label?: string
  received: number
  total: number
  bytesPerSecond: number
  error?: string
}

export interface FileEntry extends ServerFile { path: string; content?: string; binary?: boolean }
export interface MetricHistory { cpu: number[]; ram: number[]; players: number[]; tps: number[]; network?: number[] }
export interface PanelState {
  filePath: string
  javaVersions: string[]
  servers: Server[]
  files: Record<string, FileEntry[]>
  backups: Record<string, Backup[]>
  metrics: Record<string, MetricHistory>
}
