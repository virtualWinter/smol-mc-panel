import { PanelError } from './errors'
import type { ServerConfig } from './config'

export function startupArgs(config: ServerConfig): string[] {
  const command = config.startupCommand.replace(/\{\{(MIN_MEMORY|MAX_MEMORY|JAR_FILE)\}\}/g, (_, key: string) => ({ MIN_MEMORY: String(config.minMemory), MAX_MEMORY: String(config.maxMemory), JAR_FILE: JSON.stringify(config.jarFile) })[key]!)
  if (/\{\{|[\r\n\0]/u.test(command)) throw new PanelError('Invalid startup command or unknown placeholder.')
  const tokens: string[] = []
  let token = '', quote = '', active = false
  for (const char of command) {
    if (quote) { if (char === quote) quote = ''; else token += char; active = true }
    else if (char === '"' || char === "'") { quote = char; active = true }
    else if (/\s/u.test(char)) { if (active) { tokens.push(token); token = ''; active = false } }
    else { token += char; active = true }
  }
  if (quote) throw new PanelError('Unclosed quote in startup command.')
  if (active) tokens.push(token)
  if (tokens.shift() !== 'java') throw new PanelError('Startup command must begin with java; shell commands are not supported.')
  const jar = tokens.indexOf('-jar')
  if (jar < 0 || tokens[jar + 1] !== config.jarFile) throw new PanelError('Startup command must run the configured JAR with -jar.')
  return tokens
}
