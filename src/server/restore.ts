import { t, x } from 'tar'
import { PanelError } from './errors'

/** Validate the entire archive before extracting. Never permit links, devices, or traversal. */
export async function extractBackup(file: string, destination: string) {
  let bytes = 0, entries = 0
  let unsafe = false
  await t({ file, strict: true, preservePaths: true, onReadEntry(entry) {
    const path = entry.path.replace(/^\.\//u, '').replace(/\/$/u, '')
    if (++entries > 2_000_000 || !['File', 'Directory', 'OldFile'].includes(entry.type) || entry.path.startsWith('/') || path.includes('\\') || path.split('/').some((part) => part === '..') || [...path].some((c) => c.charCodeAt(0) < 32)) unsafe = true
    bytes += entry.size
    if (bytes > 100 * 1024 ** 3) unsafe = true
  } })
  if (unsafe) throw new PanelError('Unsafe backup archive or restore exceeds the 100 GiB limit.')
  await x({ file, cwd: destination, strict: true, preservePaths: false, noChmod: true, noMtime: true })
}
