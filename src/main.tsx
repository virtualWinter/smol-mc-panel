import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material'
import './index.css'
import App from './App'

const theme = createTheme({
  palette: { mode: 'dark' },
  shape: { borderRadius: 4 },
  typography: { fontFamily: 'Inter, system-ui, sans-serif', button: { textTransform: 'none' } },
  components: {
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiButton: { defaultProps: { size: 'small', disableElevation: true } },
    MuiTextField: { defaultProps: { size: 'small' } },
    MuiTab: { styleOverrides: { root: { minHeight: 38, minWidth: 72, padding: '8px 12px' } } },
    MuiTabs: { styleOverrides: { root: { minHeight: 38 } } },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </StrictMode>,
)
