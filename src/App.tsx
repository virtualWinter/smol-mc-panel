import { Container } from '@mui/material'
import ServerOverview from './components/ServerOverview'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import ServerPage from './components/ServerPage'
import { MockProvider } from './data/MockProvider'

export default function App() {
  return (
    <MockProvider><BrowserRouter>
      <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 3 } }}>
        <Routes>
          <Route path="/" element={<ServerOverview />} />
          <Route path="/:serverId/*" element={<ServerPage />} />
          <Route path="*" element={<ServerPage />} />
        </Routes>
      </Container>
    </BrowserRouter></MockProvider>
  )
}
