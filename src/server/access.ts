// First-account creation is restricted to a direct loopback connection. With a
// deliberately declared external HTTPS origin (PANEL_ORIGIN), pre-setup access
// is also allowed through an HTTPS reverse proxy that forwards the original
// Host, and either end-to-end TLS at the last proxy hop (x-forwarded-proto)
// or a Cloudflare-specific marker only present on genuinely proxied requests
// (a fronting CDN can terminate TLS and still forward plain HTTP on the
// origin side). Once configured, the login/session layer protects all operations.
export function authorizeRequest(request: Request, configured: boolean): Response | undefined {
  if (configured) return
  const url = new URL(request.url)
  const external = process.env.PANEL_ORIGIN
  if (external) {
    try {
      const declared = new URL(external)
      const cloudflare = /cloudflare/u.test(request.headers.get('cdn-loop') ?? '') || request.headers.has('cf-connecting-ip')
      if (declared.protocol === 'https:' && url.hostname === declared.hostname && url.port === declared.port && ((url.protocol === 'https:' && request.headers.get('x-forwarded-proto') === 'https') || cloudflare)) return
    } catch { /* An invalid declaration never widens the loopback-only default. */ }
  }
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || request.headers.has('x-forwarded-for') || request.headers.has('forwarded')) return new Response('Complete first-start setup locally before exposing the panel.', { status: 403 })
}
