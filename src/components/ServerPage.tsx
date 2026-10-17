'use client'

import { useState } from 'react'
import { Alert, Box, Button, Paper, Stack, Typography } from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { usePanel } from '../data/usePanel'
import ServerStats from './ServerStats'
import ServerConsole from './ServerConsole'
import ServerFiles from './ServerFiles'
import ServerBackups from './ServerBackups'
import ServerSettings from './ServerSettings'
import ServerGraphs from './ServerGraphs'
import ServerHeader from './ServerHeader'
import DownloadProgress from './DownloadProgress'

export default function ServerPage({ serverId, page }: { serverId: string; page: string }) {
  const { servers, powerServer } = usePanel()
  const [error, setError] = useState('')
  const server = servers.find((item) => item.id === serverId)
  const power = (action: 'Start' | 'Stop' | 'Restart') => { setError(''); void powerServer(serverId, action).catch((error: unknown) => setError(String(error))) }

  return (
    <Stack spacing={3}>
      <Button href="/" color="inherit" size="small" startIcon={<ArrowBackIcon />} sx={{ alignSelf: 'flex-start', color: 'text.secondary' }}>Network</Button>
      {error && <Alert severity="error">{error}</Alert>}
      {!server ? <Typography component="h1" variant="h4">Server not found</Typography> : (
        <>
          <ServerHeader server={server} page={page} />
          {server.download && !['complete'].includes(server.download.phase) && (page !== 'settings' || server.download.label?.startsWith('Java')) && <Paper variant="outlined" sx={{ p: 2 }}><DownloadProgress progress={server.download} /></Paper>}
          {!server.installed && <Alert severity="info">Install {server.jarFile} from Settings or upload it in Files.</Alert>}
          {page === 'files' ? <ServerFiles server={server} /> : page === 'backups' ? <ServerBackups server={server} /> : page === 'settings' ? <ServerSettings server={server} /> : page !== '' ? <Typography color="text.secondary">Page not found</Typography> : (
          <Stack spacing={2}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) 260px' }, gap: 2 }}>
            <Box sx={{ minWidth: 0 }}><ServerConsole server={server} /></Box>
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} aria-label="Power controls" sx={{ '& .MuiButton-root': { flex: 1, minWidth: 0 } }}>
                <Button size="small" variant="outlined" onClick={() => power('Start')}>Start</Button>
                <Button size="small" variant="outlined" onClick={() => power('Restart')}>Restart</Button>
                <Button size="small" variant="outlined" color="error" onClick={() => power('Stop')}>Stop</Button>
              </Stack>
              <ServerStats server={server} />
            </Stack>
          </Box>
          <ServerGraphs server={server} />
          </Stack>
          )}
        </>
      )}
    </Stack>
  )
}
