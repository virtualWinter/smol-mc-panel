import { createHash, timingSafeEqual } from 'node:crypto'

// All pages and Server Functions pass through this gate. Static JS contains no credentials.
export function authorizeRequest(request: Request): Response | undefined {
  const password = process.env.PANEL_PASSWORD
  if (password) {
    const expected = Buffer.from(`admin:${password}`).toString('base64')
    const actual = request.headers.get('authorization')?.replace(/^Basic /u, '') ?? ''
    const hash = (value: string) => createHash('sha256').update(value).digest()
    if (!timingSafeEqual(hash(expected), hash(actual))) return new Response('Authentication required.', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Minecraft panel", charset="UTF-8"', 'Cache-Control': 'no-store' } })
    return
  }
  const host = new URL(request.url).hostname
  if (!['localhost', '127.0.0.1', '[::1]'].includes(host) || request.headers.has('x-forwarded-for') || request.headers.has('forwarded')) return new Response('Set PANEL_PASSWORD before using the panel remotely.', { status: 403 })
}
