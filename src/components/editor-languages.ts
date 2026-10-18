import { json } from '@codemirror/lang-json'
import { yaml } from '@codemirror/lang-yaml'
import { StreamLanguage, type LanguageSupport, type Language } from '@codemirror/language'
import { properties } from '@codemirror/legacy-modes/mode/properties'
import { toml } from '@codemirror/legacy-modes/mode/toml'
import { shell } from '@codemirror/legacy-modes/mode/shell'

export function fileLanguage(name: string): 'json' | 'yaml' | 'toml' | 'properties' | 'shell' | 'text' {
  const filename = name.split('/').pop()!.toLowerCase()
  if (filename.endsWith('.json')) return 'json'
  if (/\.ya?ml$/u.test(filename)) return 'yaml'
  if (filename.endsWith('.toml')) return 'toml'
  if (/\.(properties|ini)$/u.test(filename) || filename === 'eula.txt' || filename === '.env' || filename.startsWith('.env.')) return 'properties'
  if (/\.(sh|bash|zsh)$/u.test(filename)) return 'shell'
  return 'text'
}

export function editorLanguage(name: string): LanguageSupport | Language | [] {
  switch (fileLanguage(name)) {
    case 'json': return json()
    case 'yaml': return yaml()
    case 'toml': return StreamLanguage.define(toml)
    case 'properties': return StreamLanguage.define(properties)
    case 'shell': return StreamLanguage.define(shell)
    default: return []
  }
}
