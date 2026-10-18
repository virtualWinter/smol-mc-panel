import { S3Client, ListObjectsV2Command, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { createReadStream, createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import { PanelError } from './errors'

export class BackupS3 {
  private client: S3Client
  private bucket: string
  private prefix: string
  constructor(env: NodeJS.ProcessEnv = process.env) {
    if (!env.S3_BUCKET || !env.S3_ENDPOINT || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) throw new PanelError('S3 backup configuration is incomplete.')
    const endpoint = new URL(env.S3_ENDPOINT)
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) throw new PanelError('S3 requires an HTTPS endpoint.')
    this.bucket = env.S3_BUCKET
    this.prefix = (env.S3_PREFIX || 'backups/').replace(/\/*$/u, '/')
    if (!/^[a-zA-Z0-9/_-]+\/$/u.test(this.prefix) || this.prefix.startsWith('/')) throw new PanelError('Invalid S3 backup prefix.')
    this.client = new S3Client({ endpoint: endpoint.href, region: env.S3_REGION || 'garage', forcePathStyle: env.S3_FORCE_PATH_STYLE !== 'false', credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED', maxAttempts: 3, requestHandler: { connectionTimeout: 10_000, requestTimeout: 60_000 } })
  }
  private key(id: string, backupId: string) {
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/u.test(id) || !/^[a-f0-9-]{36}$/u.test(backupId)) throw new PanelError('Invalid backup identity.')
    return `${this.prefix}${id}/${backupId}.tar.gz`
  }
  async upload(id: string, backupId: string, file: string) {
    await new Upload({ client: this.client, params: { Bucket: this.bucket, Key: this.key(id, backupId), Body: createReadStream(file), ContentType: 'application/gzip' }, queueSize: 2, partSize: 8 * 1024 * 1024, leavePartsOnError: false }).done()
  }
  async list(id: string) {
    this.key(id, '00000000-0000-0000-0000-000000000000')
    const result: { id: string; created: string; bytes: number }[] = []
    let token: string | undefined
    do {
      const page = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: `${this.prefix}${id}/`, ContinuationToken: token }))
      for (const object of page.Contents ?? []) {
        const name = object.Key?.slice(`${this.prefix}${id}/`.length)
        if (name && /^[a-f0-9-]{36}\.tar\.gz$/u.test(name) && object.LastModified) result.push({ id: name.slice(0, -7), created: object.LastModified.toISOString(), bytes: object.Size ?? 0 })
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined
    } while (token)
    return result.sort((a, b) => b.created.localeCompare(a.created))
  }
  async download(id: string, backupId: string, file: string) {
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.key(id, backupId) }))
    if (!response.Body) throw new PanelError('S3 returned an empty backup response.')
    let bytes = 0
    const limit = new Transform({ transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length
      callback(bytes > 100 * 1024 ** 3 ? new PanelError('Backup download exceeds the 100 GiB limit.') : null, chunk)
    } })
    await pipeline(response.Body.transformToWebStream(), limit, createWriteStream(file, { flags: 'wx', mode: 0o600 }))
  }
  async delete(id: string, backupId: string) { await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.key(id, backupId) })) }
}
