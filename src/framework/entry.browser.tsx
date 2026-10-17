import { createFromFetch, createFromReadableStream, createTemporaryReferenceSet, encodeReply, setServerCallback } from '@vitejs/plugin-rsc/browser'
import { hydrateRoot } from 'react-dom/client'
import { rscStream } from 'rsc-html-stream/client'
import type { RscPayload } from './entry.rsc'
import type { Root } from 'react-dom/client'
import { startTransition } from 'react'
import { connectionError, requireRscResponse } from './transport'
import DocumentBoundary from './document-boundary'

let root: Root
let queue: Promise<unknown> = Promise.resolve()
let renderEpoch = 0

function showConnectionNotice(error: unknown) {
  const message = connectionError(error).message
  let notice = document.getElementById('panel-connection-notice')
  if (!notice) {
    notice = document.createElement('div')
    notice.id = 'panel-connection-notice'
    notice.setAttribute('role', 'alert')
    Object.assign(notice.style, { position: 'fixed', bottom: '16px', right: '16px', maxWidth: '420px', padding: '16px', background: '#242424', color: '#fff', border: '1px solid #444', borderRadius: '10px', font: '14px system-ui', zIndex: '2000' })
    document.body.appendChild(notice)
  }
  notice.replaceChildren(document.createTextNode(`${message} `))
  const reload = document.createElement('button')
  reload.textContent = 'Reload'
  reload.addEventListener('click', () => window.location.reload())
  notice.appendChild(reload)
}

function renderPayload(payload: RscPayload) {
  document.getElementById('panel-connection-notice')?.remove()
  startTransition(() => root.render(<DocumentBoundary>{payload.root}</DocumentBoundary>))
}

setServerCallback((id, args) => {
  const call = queue.then(async () => {
  const url = window.location.href
  const temporaryReferences = createTemporaryReferenceSet()
  const response = fetch(url, {
    method: 'POST',
    headers: { Accept: 'text/x-component', 'x-rsc-action': id },
    body: await encodeReply(args, { temporaryReferences }),
  })
  const payload = await createFromFetch<RscPayload>(response.then(requireRscResponse), { temporaryReferences })
  if (!payload.result?.ok) throw new Error(String(payload.result?.data ?? 'Server operation failed.'))
   renderEpoch++
   if (window.location.href === url) renderPayload(payload)
  return payload.result.data
  })
  const safeCall = call.catch((error: unknown) => { throw connectionError(error) })
  queue = safeCall.catch(() => {})
  return safeCall
})

async function main() {
  const payload = await createFromReadableStream<RscPayload>(rscStream)
  root = hydrateRoot(document, <DocumentBoundary>{payload.root}</DocumentBoundary>)
  const navigate = async () => {
    const epoch = renderEpoch
    const url = window.location.href
    const payload = await createFromFetch<RscPayload>(fetch(url, { headers: { Accept: 'text/x-component' } }).then(requireRscResponse))
    if (window.location.href === url && epoch === renderEpoch) renderPayload(payload)
  }
  window.addEventListener('popstate', () => { void navigate().catch(showConnectionNotice) })
  window.addEventListener('panel:navigate', () => { void navigate().catch(showConnectionNotice) })
  let refreshing = false
  setInterval(() => {
    if (document.visibilityState !== 'visible' || refreshing || document.querySelector('[data-panel-auth]')) return
    refreshing = true
    // Use the RSC transport for live snapshots; no REST endpoint is exposed.
    void navigate().catch(showConnectionNotice).finally(() => { refreshing = false })
  }, 1000)
  document.addEventListener('click', (event) => {
    const link = event.target instanceof Element ? event.target.closest('a') : null
    if (!(link instanceof HTMLAnchorElement) || link.origin !== location.origin || link.target || link.hasAttribute('download') || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.defaultPrevented) return
    event.preventDefault()
    history.pushState(null, '', link.href)
    void navigate().catch(showConnectionNotice)
  })
  if (import.meta.hot) import.meta.hot.on('rsc:update', async () => {
    try { await navigate() } catch (error) { showConnectionNotice(error) }
  })
}

void main().catch(showConnectionNotice)
