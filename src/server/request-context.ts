import { AsyncLocalStorage } from 'node:async_hooks'
import { PanelError } from './errors'
import { issueSession, sessionCookie, sessionLifetime, type AdminAccount } from './accounts'

export interface RequestContext {
  request: Request
  root: string
  user?: string
  headers: Headers
}

export const requests = new AsyncLocalStorage<RequestContext>()

export function requestContext(): RequestContext {
  const context = requests.getStore()
  if (!context) throw new PanelError('This operation requires an authenticated panel request.')
  return context
}

export function requireAdmin() {
  const context = requestContext()
  if (!context.user) throw new PanelError('Sign in to manage the network.')
  return context.user
}

export function setSession(account?: AdminAccount) {
  const context = requestContext()
  context.user = account?.username
  const secure = new URL(process.env.PANEL_ORIGIN || context.request.url).protocol === 'https:' ? '; Secure' : ''
  context.headers.set('Set-Cookie', `${sessionCookie}=${account ? issueSession(account) : ''}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${account ? sessionLifetime : 0}${secure}`)
}
