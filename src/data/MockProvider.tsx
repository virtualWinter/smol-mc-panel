import { createContext, useContext, useState } from 'react'
import { networkServers } from './mockData'
import type { ReactNode } from 'react'
import type { Server } from '../types'

interface MockState {
  servers: Server[]
  updateServer: (id: string, changes: Partial<Server>) => void
}
const MockContext = createContext<MockState | null>(null)

export function MockProvider({ children }: { children: ReactNode }) {
  const [servers, setServers] = useState(networkServers)
  const updateServer: MockState['updateServer'] = (id, changes) => setServers((current) => current.map((server) => server.id === id ? { ...server, ...changes } : server))
  return <MockContext.Provider value={{ servers, updateServer }}>{children}</MockContext.Provider>
}

export function useMock() {
  const context = useContext(MockContext)
  if (!context) throw new Error('MockProvider is required')
  return context
}
