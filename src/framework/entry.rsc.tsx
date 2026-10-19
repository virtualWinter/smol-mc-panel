import { createTemporaryReferenceSet, decodeReply, loadServerAction, renderToReadableStream } from '@vitejs/plugin-rsc/rsc/server'
import type { ReactNode } from 'react'
import App from '../App'
import { authorizeRequest } from '../server/access'
import { PanelError } from '../server/errors'
import { dataRoot } from '../server/store'
import { bootstrapStorage } from '../server/doc-store'
import { readAccount, sessionFromRequest } from '../server/accounts'
import { requests } from '../server/request-context'

export interface RscPayload {
  root: ReactNode
  result?: { ok: boolean; data: unknown }
}

const server = { fetch: handleRequest }
export default server

async function handleRequest(request: Request): Promise<Response> {
  const root = dataRoot()
  try { await bootstrapStorage(root) }
  catch (error) {
    console.error('Panel storage unavailable', error)
    return new Response('Panel storage is unavailable. Check the database connection and try again.', { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
  const account = readAccount(root)
  const denied = authorizeRequest(request, Boolean(account))
  if (denied) return denied
  const context = { request, root, user: sessionFromRequest(account, request), headers: new Headers() }
  return requests.run(context, async () => {
    const response = await renderRequest(request)
    context.headers.forEach((value, key) => response.headers.append(key, value))
    return response
  })
}

async function renderRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)
  if (!['GET', 'POST'].includes(request.method)) return new Response('Method not allowed', { status: 405 })
  let result: RscPayload['result']
  let temporaryReferences: ReturnType<typeof createTemporaryReferenceSet> | undefined
  const actionId = request.headers.get('x-rsc-action')
  if (request.method === 'POST') {
    // Server Functions are callable endpoints: reject cross-origin calls before dispatch.
    const expectedOrigin = process.env.PANEL_ORIGIN ? new URL(process.env.PANEL_ORIGIN).origin : url.origin
    if (request.headers.get('origin') !== expectedOrigin || !actionId) return new Response('Forbidden', { status: 403 })
    const length = Number(request.headers.get('content-length'))
    if (length > 160 * 1024 * 1024) return new Response('Request too large', { status: 413 })
    try {
      const chunks: Uint8Array[] = []
      let size = 0
      const reader = request.body?.getReader()
      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          size += value.byteLength
          if (size > 160 * 1024 * 1024) { await reader.cancel(); return new Response('Request too large', { status: 413 }) }
          chunks.push(value)
        }
      }
      const bytes = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
      const contentType = request.headers.get('content-type') ?? 'text/plain'
      const boundedBody = new Response(bytes, { headers: { 'Content-Type': contentType } })
      temporaryReferences = createTemporaryReferenceSet()
      const body = contentType.startsWith('multipart/form-data') ? await boundedBody.formData() : await boundedBody.text()
      const args = await decodeReply(body, { temporaryReferences })
      const action = await loadServerAction(actionId)
      result = { ok: true, data: await action(...args) }
    } catch (error) {
      const expected = error instanceof PanelError || (error instanceof Error && error.name === 'PanelError')
      if (!expected) console.error('Server Function failed', error)
      result = { ok: false, data: expected ? error.message : 'Server operation failed. See the panel logs for details.' }
    }
  }
  const root = <html lang="en"><head><meta charSet="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>smol-mc-panel</title></head><body style={{ margin: 0, background: '#121212', color: '#fff' }}><App url={url.href} /></body></html>
  const stream = renderToReadableStream<RscPayload>({ root, result }, { temporaryReferences })
  const headers = { 'Cache-Control': 'no-store', Vary: 'Accept, x-rsc-action' }
  if (request.headers.get('accept')?.includes('text/x-component') || actionId) {
    return new Response(stream, { headers: { ...headers, 'Content-Type': 'text/x-component;charset=utf-8' } })
  }
  const ssr = await import.meta.viteRsc.loadModule<typeof import('./entry.ssr')>('ssr', 'index')
  return new Response(await ssr.renderHTML(stream), { headers: { ...headers, 'Content-Type': 'text/html;charset=utf-8' } })
}

if (import.meta.hot) import.meta.hot.accept()
