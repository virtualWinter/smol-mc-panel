'use client'

import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import type { PanelState } from '../types'
import * as actions from '../server/actions'

const PanelContext = createContext<(PanelState & typeof actions) | null>(null)

export function MockProvider({ children, state }: { children: ReactNode; state: PanelState }) {
  return <PanelContext.Provider value={{ ...state, ...actions }}>{children}</PanelContext.Provider>
}

export function useMock() {
  const context = useContext(PanelContext)
  if (!context) throw new Error('Panel provider is required')
  return context
}
