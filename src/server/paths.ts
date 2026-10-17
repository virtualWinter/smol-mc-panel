import { existsSync, lstatSync, mkdirSync, realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { validateRelativePath } from './config'
import { PanelError } from './errors'

export function safePath(root: string, path: string, allowEmpty = false): string {
  validateRelativePath(path, allowEmpty)
  const base = realpathSync(root)
  const target = resolve(base, path)
  const rel = relative(base, target)
  if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) throw new PanelError('Path escapes the server directory.')
  let current = base
  for (const part of rel.split(sep).filter(Boolean)) {
    current = resolve(current, part)
    if (existsSync(current) || (() => { try { lstatSync(current); return true } catch { return false } })()) {
      if (lstatSync(current).isSymbolicLink()) throw new PanelError('Symbolic links are not supported.')
    }
  }
  return target
}

export function serverDirectory(root: string, workingDirectory: string) {
  mkdirSync(root, { recursive: true, mode: 0o700 })
  const directory = safePath(root, workingDirectory)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  return directory
}
