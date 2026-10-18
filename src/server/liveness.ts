import { readFileSync } from 'node:fs'

// Container runtime PID namespaces recycle low PIDs across restarts, so a
// stored PID alone may appear alive even though its original holder is gone.
// /proc/<pid>/stat field 22 (process start time, in clock ticks) distinguishes
// an actual survivor from an unrelated process that reused the number.

export function processStart(pid: number): number | undefined {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
    const start = Number(fields[19])
    return Number.isFinite(start) && start > 0 ? start : undefined
  } catch { return undefined }
}

export function processAlive(pid: number, start?: unknown): boolean {
  if (!Number.isInteger(pid) || pid < 1 || !Number.isSafeInteger(pid)) return false
  let exists = true
  try {
    process.kill(pid, 0)
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String(error.code) : ''
    if (code === 'ESRCH') return false
    // EPERM or other errors: a process exists that we cannot signal.
  }
  if (typeof start === 'number' && start > 0) {
    const current = processStart(pid)
    if (current !== undefined && current !== start) return false
  }
  void exists
  return true
}

export interface Registration { pid: number; start?: number }

// Accepts legacy plain-number entries and the current { pid, start } shape.
export function registration(value: unknown): Registration | undefined {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 1 ? { pid: value } : undefined
  if (value && typeof value === 'object' && 'pid' in value) {
    const { pid, start } = value as { pid?: unknown; start?: unknown }
    if (typeof pid === 'number' && Number.isSafeInteger(pid) && pid >= 1 && (start === undefined || (typeof start === 'number' && start > 0 && Number.isSafeInteger(start)))) return { pid, start }
  }
  return undefined
}
