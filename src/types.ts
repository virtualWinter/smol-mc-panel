export interface Server {
  id: string
  name: string
  address: string
  status: string
  memory: string
  players: string
  cpu: string
  logs: string[]
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
export interface ServerFile { name: string; size: string; directory?: boolean }
export interface Backup { id: string; name: string; created: string; size: string }
