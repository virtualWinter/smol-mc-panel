'use client'

import type { ReactNode } from 'react'
import type { PanelState } from '../types'
import * as actions from '../server/actions'
import { PanelContext } from './usePanel'

export function PanelProvider({ children, state }: { children: ReactNode; state: PanelState }) {
  return <PanelContext.Provider value={{ ...state, ...actions }}>{children}</PanelContext.Provider>
}
