import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function readAgentSources(): Record<string, string> {
  const directory = resolve(process.cwd(), 'agent/src/cc/arsn/panel/metrics')
  return Object.fromEntries(['Agent.java', 'Bridge.java'].map((name) => [name, readFileSync(resolve(directory, name), 'utf8')]))
}
