import { createFromReadableStream, getClientEntryUrl } from '@vitejs/plugin-rsc/ssr'
import { use } from 'react'
import { renderToReadableStream } from 'react-dom/server.edge'
import { injectRSCPayload } from 'rsc-html-stream/server'
import type { RscPayload } from './entry.rsc'

export async function renderHTML(stream: ReadableStream<Uint8Array>) {
  const [renderStream, hydrationStream] = stream.tee()
  let payload: Promise<RscPayload> | undefined
  function Root() {
    payload ??= createFromReadableStream<RscPayload>(renderStream)
    return use(payload).root
  }
  const html = await renderToReadableStream(<Root />, { bootstrapModules: [getClientEntryUrl()] })
  return html.pipeThrough(injectRSCPayload(hydrationStream))
}
