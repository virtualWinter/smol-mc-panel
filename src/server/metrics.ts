import { readFileSync } from 'node:fs'
import { createConnection } from 'node:net'
import type { MetricHistory } from '../types'

export function appendMetric(history: number[], value: number) {
  history.push(value)
  if (history.length > 60) history.shift()
}

export function emptyMetrics(proxy: boolean): MetricHistory {
  return { cpu: [], ram: [], players: [], tps: [], ...(proxy ? { network: [] } : {}) }
}

export function processUsage(pid: number): { ticks: number; rssMiB: number } | undefined {
  if (process.platform !== 'linux') return undefined
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
    const status = readFileSync(`/proc/${pid}/status`, 'utf8')
    const rss = Number(status.match(/^VmRSS:\s+(\d+)/mu)?.[1] ?? 0)
    return { ticks: Number(fields[11]) + Number(fields[12]), rssMiB: rss / 1024 }
  } catch { return undefined }
}

export function varInt(value: number): Buffer {
  const bytes: number[] = []
  do { let byte = value & 127; value >>>= 7; if (value) byte |= 128; bytes.push(byte) } while (value)
  return Buffer.from(bytes)
}

function decodeVarInt(buffer: Buffer, offset = 0): { value: number; offset: number } | undefined {
  let value = 0
  for (let index = 0; index < 5; index++) {
    if (offset + index >= buffer.length) return undefined
    const byte = buffer[offset + index]
    value |= (byte & 127) << (7 * index)
    if (!(byte & 128)) return { value, offset: offset + index + 1 }
  }
  throw new Error('Invalid status packet')
}

export function queryPlayers(port: number, timeout = 1000): Promise<{ online: number; max: number } | undefined> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port })
    let buffer = Buffer.alloc(0), settled = false
    const finish = (value?: { online: number; max: number }) => { if (settled) return; settled = true; socket.destroy(); resolve(value) }
    socket.setTimeout(timeout, () => finish())
    socket.on('error', () => finish())
    socket.on('close', () => finish())
    socket.on('connect', () => {
      const host = Buffer.from('127.0.0.1')
      const portBytes = Buffer.alloc(2); portBytes.writeUInt16BE(port)
      const handshake = Buffer.concat([varInt(0), varInt(767), varInt(host.length), host, portBytes, varInt(1)])
      socket.write(Buffer.concat([varInt(handshake.length), handshake, Buffer.from([1, 0])]))
    })
    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk])
      if (buffer.length > 1024 * 1024) { finish(); return }
      try {
        const length = decodeVarInt(buffer)
        if (!length || length.value < 0 || length.value > 1024 * 1024) { if (length) finish(); return }
        if (buffer.length < length.offset + length.value) return
        const packet = decodeVarInt(buffer, length.offset)
        if (!packet || packet.value !== 0) { finish(); return }
        const text = decodeVarInt(buffer, packet.offset)
        if (!text || text.value < 0 || text.offset + text.value > length.offset + length.value) { finish(); return }
        const data = JSON.parse(buffer.subarray(text.offset, text.offset + text.value).toString()) as { players?: { online?: unknown; max?: unknown } }
        const online = data.players?.online, max = data.players?.max
        finish(typeof online === 'number' && typeof max === 'number' && Number.isInteger(online) && Number.isInteger(max) && online >= 0 && max >= online ? { online, max } : undefined)
      } catch { finish() }
    })
  })
}
