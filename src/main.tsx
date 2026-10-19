'use client'

import { StrictMode } from 'react'
import type { ReactNode } from 'react'
import { Alert, Box, Container, CssBaseline, ThemeProvider, createTheme } from '@mui/material'
import './index.css'
import { PanelProvider } from './data/PanelProvider'
import AppHeader from './components/AppHeader'
import type { PanelState } from './types'
import { Component } from 'react'

class PanelErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false }
  static getDerivedStateFromError() { return { error: true } }
  render() { return this.state.error ? <Alert severity="error">Could not render the panel. Reload to try again.</Alert> : this.props.children }
}

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
    MuiDialogTitle: { styleOverrides: { root: { fontSize: 16, fontWeight: 600, padding: '16px 24px' } } },
    MuiDialogActions: { styleOverrides: { root: { padding: '16px 24px', gap: 4 } } },
    MuiAccordion: { styleOverrides: { root: { backgroundImage: 'none' } } },
  },
})

export function Shell({ children, header }: { children: ReactNode; header?: ReactNode }) {
  return (
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <PanelErrorBoundary>
        <Box sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
          {header ?? <AppHeader />}
          <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 4 }, px: { xs: 2, sm: 4 }, flex: 1 }}>{children}</Container>
        </Box>
      </PanelErrorBoundary>
    </ThemeProvider>
  </StrictMode>
  )
}

export default function Panel({ children, state }: { children: ReactNode; state: PanelState }) {
  return <PanelProvider state={state}><Shell header={<AppHeader user={state.user} />}>{children}</Shell></PanelProvider>
}
