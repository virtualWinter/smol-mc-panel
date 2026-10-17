'use client'

import { lazy, StrictMode, Suspense, useSyncExternalStore } from 'react'
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material'
import './index.css'
const App = lazy(() => import('./App'))
const subscribe = () => () => {}

const theme = createTheme({
  palette: { mode: 'dark' },
  shape: { borderRadius: 10 },
  typography: { fontFamily: 'Inter, system-ui, sans-serif', button: { textTransform: 'none' } },
  components: {
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiButton: { defaultProps: { size: 'small', disableElevation: true } },
    MuiTextField: { defaultProps: { size: 'small' } },
    MuiTab: { styleOverrides: { root: { minHeight: 38, minWidth: 72, padding: '8px 12px' } } },
    MuiTabs: { styleOverrides: { root: { minHeight: 38 } } },
  },
})

export default function Panel() {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false)
  if (!mounted) return null
  return (
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Suspense fallback={null}><App /></Suspense>
    </ThemeProvider>
  </StrictMode>
  )
}
