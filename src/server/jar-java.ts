import { open } from 'yauzl'
import { PanelError } from './errors'

function jarEntry(path: string, name: string, limit: number): Promise<Buffer | undefined> {
  return new Promise((resolve, reject) => {
    open(path, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
      if (error || !zip) { reject(new PanelError('Could not inspect the server JAR. Reinstall a valid executable JAR.')); return }
      let settled = false, count = 0
      const finish = (value?: Buffer, error?: Error) => {
        if (settled) return
        settled = true; zip.close()
        if (error) reject(error); else resolve(value)
      }
      zip.on('error', () => finish(undefined, new PanelError('Could not read the server JAR.')))
      zip.on('end', () => finish())
      zip.on('entry', (entry) => {
        if (++count > 100_000) { finish(undefined, new PanelError('Server JAR contains too many entries.')); return }
        if (entry.fileName !== name) { zip.readEntry(); return }
        if (entry.uncompressedSize > limit) { finish(undefined, new PanelError('Server JAR metadata or main class is too large.')); return }
        zip.openReadStream(entry, (error, stream) => {
          if (error || !stream) { finish(undefined, new PanelError('Could not read the server JAR main class.')); return }
          const chunks: Buffer[] = []
          let size = 0
          stream.on('data', (chunk: Buffer) => {
            size += chunk.length
            if (size > limit) { stream.destroy(); finish(undefined, new PanelError('Server JAR entry exceeded its size limit.')); return }
            chunks.push(chunk)
          })
          stream.on('error', () => finish(undefined, new PanelError('Server JAR entry is corrupt.')))
          stream.on('end', () => finish(Buffer.concat(chunks)))
        })
      })
      zip.readEntry()
    })
  })
}

export async function requiredJava(path: string): Promise<number> {
  const manifest = await jarEntry(path, 'META-INF/MANIFEST.MF', 64 * 1024)
  const main = manifest?.toString('utf8').replace(/\r?\n /gu, '').match(/^Main-Class:\s*([^\r\n]+)$/imu)?.[1].trim()
  if (!main || !/^[\w$]+(?:\.[\w$]+)*$/u.test(main)) throw new PanelError('The server JAR has no valid Main-Class manifest entry.')
  // Inspect the executable entry point, not optional META-INF/versions classes or
  // Build-Jdk metadata, which can target newer JDKs without requiring them.
  const bytes = await jarEntry(path, `${main.replaceAll('.', '/')}.class`, 16 * 1024 * 1024)
  if (!bytes || bytes.length < 8 || bytes.readUInt32BE(0) !== 0xcafebabe) throw new PanelError('The server JAR main class is missing or invalid.')
  const major = bytes.readUInt16BE(6)
  if (major < 45) throw new PanelError('The server JAR has an invalid class file version.')
  return major - 44
}
