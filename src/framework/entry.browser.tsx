import { createFromFetch, createFromReadableStream, createTemporaryReferenceSet, encodeReply, setServerCallback } from '@vitejs/plugin-rsc/browser'
import { hydrateRoot } from 'react-dom/client'
import { rscStream } from 'rsc-html-stream/client'
import type { RscPayload } from './entry.rsc'

setServerCallback(async (id, args) => {
  const temporaryReferences = createTemporaryReferenceSet()
  const response = fetch(window.location.href, {
    method: 'POST',
    headers: { Accept: 'text/x-component', 'x-rsc-action': id },
    body: await encodeReply(args, { temporaryReferences }),
  })
  const payload = await createFromFetch<RscPayload>(response, { temporaryReferences })
  if (!payload.result?.ok) throw new Error(String(payload.result?.data ?? 'Server operation failed.'))
  return payload.result.data
})

async function main() {
  const payload = await createFromReadableStream<RscPayload>(rscStream)
  const root = hydrateRoot(document, payload.root)
  if (import.meta.hot) import.meta.hot.on('rsc:update', async () => {
    const next = await createFromFetch<RscPayload>(fetch(window.location.href, { headers: { Accept: 'text/x-component' } }))
    root.render(next.root)
  })
}

void main()
