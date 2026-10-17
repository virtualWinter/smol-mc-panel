import { createTemporaryReferenceSet, decodeReply, loadServerAction, renderToReadableStream } from '@vitejs/plugin-rsc/rsc/server'
import type { ReactNode } from 'react'
import Panel from '../main'

export interface RscPayload {
  root: ReactNode
  result?: { ok: boolean; data: unknown }
}

export default { fetch: handleRequest }

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)
  if (!['GET', 'POST'].includes(request.method)) return new Response('Method not allowed', { status: 405 })
  let result: RscPayload['result']
  let temporaryReferences: ReturnType<typeof createTemporaryReferenceSet> | undefined
  const actionId = request.headers.get('x-rsc-action')
  if (request.method === 'POST') {
    // Server Functions are callable endpoints: reject cross-origin calls before dispatch.
    if (request.headers.get('origin') !== url.origin || !actionId) return new Response('Forbidden', { status: 403 })
    const length = Number(request.headers.get('content-length'))
    if (length > 1024 * 1024) return new Response('Request too large', { status: 413 })
    try {
      temporaryReferences = createTemporaryReferenceSet()
      const body = request.headers.get('content-type')?.startsWith('multipart/form-data') ? await request.formData() : await request.text()
      const args = await decodeReply(body, { temporaryReferences })
      const action = await loadServerAction(actionId)
      result = { ok: true, data: await action(...args) }
    } catch (error) {
      console.error('Server Function failed', error)
      result = { ok: false, data: 'Server operation failed.' }
    }
  }
  const root = <html lang="en"><head><meta charSet="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>smol-mc-panel</title></head><body style={{ margin: 0, background: '#121212', color: '#fff' }}><Panel /></body></html>
  const stream = renderToReadableStream<RscPayload>({ root, result }, { temporaryReferences })
  const headers = { 'Cache-Control': 'no-store', Vary: 'Accept, x-rsc-action' }
  if (request.headers.get('accept')?.includes('text/x-component') || actionId) {
    return new Response(stream, { headers: { ...headers, 'Content-Type': 'text/x-component;charset=utf-8' } })
  }
  const ssr = await import.meta.viteRsc.loadModule<typeof import('./entry.ssr')>('ssr', 'index')
  return new Response(await ssr.renderHTML(stream), { headers: { ...headers, 'Content-Type': 'text/html;charset=utf-8' } })
}

if (import.meta.hot) import.meta.hot.accept()
