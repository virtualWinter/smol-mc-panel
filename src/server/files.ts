import { lstatSync, openSync, closeSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync, constants } from 'node:fs'
import { dirname, basename, resolve } from 'node:path'
import type { FileEntry } from '../types'
import { safePath } from './paths'
import { PanelError } from './errors'

export const MAX_UPLOAD = 128 * 1024 * 1024
const MAX_EDIT = 512 * 1024

export function listDirectory(root: string, directory = ''): FileEntry[] {
  const path = safePath(root, directory, true)
  if (!statSync(path).isDirectory()) throw new PanelError('Directory not found.')
  return readdirSync(path, { withFileTypes: true }).filter((file) => !file.isSymbolicLink()).slice(0, 2000).map((file) => {
    const full = safePath(root, [directory, file.name].filter(Boolean).join('/'))
    const info = lstatSync(full)
    return { name: file.name, path: [directory, file.name].filter(Boolean).join('/'), directory: info.isDirectory(), size: info.isDirectory() ? '—' : formatBytes(info.size), modified: info.mtime.toISOString(), binary: /\.(jar|zip|gz|png|jpg|jpeg|dat|mca|mcc|db|lock)$/iu.test(file.name) }
  })
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MiB`
}

export function readText(root: string, path: string) {
  const full = safePath(root, path)
  const info = statSync(full)
  if (!info.isFile() || info.size > MAX_EDIT) throw new PanelError('Only text files up to 512 KiB can be edited.')
  const bytes = readFileSync(full)
  if (bytes.includes(0) || /\.(jar|zip|gz)$/iu.test(full)) throw new PanelError('Binary files cannot be edited.')
  return bytes.toString('utf8')
}

export function writeText(root: string, path: string, content: string) {
  if (typeof content !== 'string' || Buffer.byteLength(content) > MAX_EDIT || content.includes('\0')) throw new PanelError('Only text files up to 512 KiB can be edited.')
  readText(root, path)
  const full = safePath(root, path)
  const temporary = resolve(dirname(full), `.${basename(full)}.panel-${crypto.randomUUID()}.tmp`)
  writeFileSync(temporary, content, { flag: 'wx', mode: statSync(full).mode & 0o777 })
  renameSync(temporary, full)
}

export function moveEntry(root: string, source: string, destination: string) {
  const from = safePath(root, source)
  const directory = safePath(root, destination, true)
  if (!statSync(directory).isDirectory()) throw new PanelError('Destination is not a directory.')
  const next = [destination, basename(source)].filter(Boolean).join('/')
  if (source === next) return
  if (destination === source || destination.startsWith(`${source}/`)) throw new PanelError('A folder cannot be moved into itself.')
  const to = safePath(root, next)
  try { lstatSync(to); throw new PanelError('An item with that name already exists.') } catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error }
  renameSync(from, to)
}

export async function uploadEntries(root: string, destination: string, data: FormData) {
  const directory = safePath(root, destination, true)
  if (!statSync(directory).isDirectory()) throw new PanelError('Destination is not a directory.')
  const uploads = data.getAll('files')
  if (!uploads.length || uploads.length > 50) throw new PanelError('Upload between 1 and 50 files.')
  for (const upload of uploads) {
    if (!(upload instanceof File) || upload.size > MAX_UPLOAD || !upload.name || upload.name.includes('/')) throw new PanelError('Each file must be no larger than 128 MiB.')
    safePath(root, [destination, upload.name].filter(Boolean).join('/'))
  }
  for (const upload of uploads as File[]) {
    let suffix = 0
    let descriptor: number
    while (true) {
      const name = upload.name + (suffix ? ` (${suffix})` : '')
      const full = safePath(root, [destination, name].filter(Boolean).join('/'))
      try { descriptor = openSync(full, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); break }
      catch (error) { if (error instanceof Error && 'code' in error && error.code === 'EEXIST') { suffix++; continue } throw error }
    }
    try { writeFileSync(descriptor, Buffer.from(await upload.arrayBuffer())) } finally { closeSync(descriptor) }
  }
}
