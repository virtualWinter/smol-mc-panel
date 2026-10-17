import { Box, Button, Stack, Typography } from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { Link, useParams } from 'react-router-dom'
import { useMock } from '../data/MockProvider'
import ServerStats from './ServerStats'
import ServerConsole from './ServerConsole'
import ServerFiles from './ServerFiles'
import ServerBackups from './ServerBackups'
import ServerSettings from './ServerSettings'
import ServerGraphs from './ServerGraphs'
import ServerHeader from './ServerHeader'

export default function ServerPage() {
  const { serverId, '*': page = '' } = useParams()
  const { servers, updateServer } = useMock()
  const server = servers.find((item) => item.id === serverId)
  const power = (action: 'Start' | 'Stop' | 'Restart') => server && updateServer(server.id, {
    status: action === 'Stop' ? 'Offline' : 'Online',
    logs: [...server.logs, `[MOCK] ${action} requested.`, `[MOCK] Server ${action === 'Stop' ? 'stopped' : 'started'}.`],
  })

  return (
    <Stack spacing={2}>
      <Button component={Link} to="/" color="inherit" size="small" startIcon={<ArrowBackIcon />} sx={{ alignSelf: 'flex-start', color: 'text.secondary' }}>Network</Button>
      {!server ? <Typography component="h1" variant="h4">Server not found</Typography> : (
        <>
          <ServerHeader server={server} page={page} />
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
