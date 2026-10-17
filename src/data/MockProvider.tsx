import { createContext, useContext, useEffect, useState } from 'react'
import { networkServers } from './mockData'
import type { ReactNode } from 'react'
import type { Server } from '../types'

interface MockState {
  servers: Server[]
  updateServer: (id: string, changes: Partial<Server>) => void
  reorderServers: (activeId: string, overId: string) => void
}
const MockContext = createContext<MockState | null>(null)

export function MockProvider({ children }: { children: ReactNode }) {
  const [servers, setServers] = useState(() => {
    try {
      const order: unknown = JSON.parse(localStorage.getItem('server-order') ?? '[]')
      if (Array.isArray(order) && order.every((id) => typeof id === 'string')) {
        const rank = (id: string) => order.includes(id) ? order.indexOf(id) : order.length
        return [...networkServers].sort((a, b) => rank(a.id) - rank(b.id))
      }
    } catch { /* Storage may be unavailable. */ }
    return networkServers
  })
  useEffect(() => {
    try { localStorage.setItem('server-order', JSON.stringify(servers.map((server) => server.id))) } catch { /* Keep ordering in memory if storage is unavailable. */ }
  }, [servers])
  const reorderServers = (activeId: string, overId: string) => setServers((current) => {
    const from = current.findIndex((server) => server.id === activeId)
    const to = current.findIndex((server) => server.id === overId)
    if (from < 0 || to < 0 || from === to) return current
    const next = [...current]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    return next
  })
  const updateServer: MockState['updateServer'] = (id, changes) => setServers((current) => current.map((server) => server.id === id ? { ...server, ...changes } : server))
  return <MockContext.Provider value={{ servers, updateServer, reorderServers }}>{children}</MockContext.Provider>
}

export function useMock() {
  const context = useContext(MockContext)
  if (!context) throw new Error('MockProvider is required')
  return context
}
