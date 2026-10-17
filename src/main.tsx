import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material'
import './index.css'
import App from './App'

const theme = createTheme({
  palette: { mode: 'dark' },
  shape: { borderRadius: 4 },
  typography: { fontFamily: 'Inter, system-ui, sans-serif', button: { textTransform: 'none' } },
  components: { MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </StrictMode>,
)
