// First-account creation is restricted to a direct loopback connection. With a
// deliberately declared external HTTPS origin (PANEL_ORIGIN), pre-setup access
// is also allowed through an HTTPS reverse proxy that forwards the original
// Host and body-scheme (x-forwarded-proto). Once configured, the login/session
// layer protects all operations.
export function authorizeRequest(request: Request, configured: boolean): Response | undefined {
  if (configured) return
  const url = new URL(request.url)
  const external = process.env.PANEL_ORIGIN
  if (external) {
    try {
      const declared = new URL(external)
      if (declared.protocol === 'https:' && url.protocol === 'https:' && url.hostname === declared.hostname && url.port === declared.port && request.headers.get('x-forwarded-proto') === 'https') return
    } catch { /* An invalid declaration never widens the loopback-only default. */ }
  }
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || request.headers.has('x-forwarded-for') || request.headers.has('forwarded')) return new Response('Complete first-start setup locally before exposing the panel.', { status: 403 })
}
