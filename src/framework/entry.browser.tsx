import { createFromFetch, createFromReadableStream, createTemporaryReferenceSet, encodeReply, setServerCallback } from '@vitejs/plugin-rsc/browser'
import { hydrateRoot } from 'react-dom/client'
import { rscStream } from 'rsc-html-stream/client'
import type { RscPayload } from './entry.rsc'
import type { Root } from 'react-dom/client'

let root: Root
let queue: Promise<unknown> = Promise.resolve()
let renderEpoch = 0

setServerCallback((id, args) => {
  const call = queue.then(async () => {
  const url = window.location.href
  const temporaryReferences = createTemporaryReferenceSet()
  const response = fetch(url, {
    method: 'POST',
    headers: { Accept: 'text/x-component', 'x-rsc-action': id },
    body: await encodeReply(args, { temporaryReferences }),
  })
  const payload = await createFromFetch<RscPayload>(response, { temporaryReferences })
  if (!payload.result?.ok) throw new Error(String(payload.result?.data ?? 'Server operation failed.'))
   renderEpoch++
   if (window.location.href === url) root.render(payload.root)
  return payload.result.data
  })
  queue = call.catch(() => {})
  return call
})

async function main() {
  const payload = await createFromReadableStream<RscPayload>(rscStream)
  root = hydrateRoot(document, payload.root)
  const navigate = async () => {
    const epoch = renderEpoch
    const url = window.location.href
    const payload = await createFromFetch<RscPayload>(fetch(url, { headers: { Accept: 'text/x-component' } }))
    if (window.location.href === url && epoch === renderEpoch) root.render(payload.root)
  }
  window.addEventListener('popstate', () => { void navigate() })
  window.addEventListener('panel:navigate', () => { void navigate() })
  let refreshing = false
  setInterval(() => {
    if (document.visibilityState !== 'visible' || refreshing) return
    refreshing = true
    // Use the RSC transport for live snapshots; no REST endpoint is exposed.
    void navigate().catch((error: unknown) => console.warn('Panel refresh failed', error)).finally(() => { refreshing = false })
  }, 1000)
  document.addEventListener('click', (event) => {
    const link = event.target instanceof Element ? event.target.closest('a') : null
    if (!(link instanceof HTMLAnchorElement) || link.origin !== location.origin || link.target || link.hasAttribute('download') || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.defaultPrevented) return
    event.preventDefault()
    history.pushState(null, '', link.href)
    void navigate()
  })
  if (import.meta.hot) import.meta.hot.on('rsc:update', async () => {
    const next = await createFromFetch<RscPayload>(fetch(window.location.href, { headers: { Accept: 'text/x-component' } }))
    root.render(next.root)
  })
}

void main()
