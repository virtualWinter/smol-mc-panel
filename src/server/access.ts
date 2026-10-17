// First-account creation is restricted to a direct loopback connection.
// Once configured, the login/session layer protects all operations.
export function authorizeRequest(request: Request, configured: boolean): Response | undefined {
  if (configured) return
  const host = new URL(request.url).hostname
  if (!['localhost', '127.0.0.1', '[::1]'].includes(host) || request.headers.has('x-forwarded-for') || request.headers.has('forwarded')) return new Response('Complete first-start setup locally before exposing the panel.', { status: 403 })
}
