'use client'

import { createContext, useContext } from 'react'
import type { PanelState } from '../types'
import type * as actions from '../server/actions'

export const PanelContext = createContext<(PanelState & typeof actions) | null>(null)

export function usePanel() {
  const context = useContext(PanelContext)
  if (!context) throw new Error('PanelProvider is required')
  return context
}
