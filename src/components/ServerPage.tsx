import { Box, Button, Chip, Stack, Tab, Tabs, Typography } from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { Link, useParams } from 'react-router-dom'
import { useMock } from '../data/MockProvider'
import ServerStats from './ServerStats'
import ServerConsole from './ServerConsole'
import ServerFiles from './ServerFiles'
import ServerBackups from './ServerBackups'
import ServerSettings from './ServerSettings'

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
          <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between' }} spacing={2}>
            <Box>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                <Typography component="h1" variant="h5" sx={{ fontWeight: 600 }}>{server.name}</Typography>
                <Chip label={server.status} color={server.status === 'Online' ? 'success' : 'default'} variant="outlined" size="small" />
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>{server.address}</Typography>
            </Box>
          </Stack>
          <Tabs value={['', 'files', 'backups', 'settings'].includes(page) ? page : false} variant="scrollable" scrollButtons="auto" aria-label="Server navigation" sx={{ alignSelf: 'flex-start', maxWidth: '100%', borderBottom: 1, borderColor: 'divider' }}>
            {[['', 'Console'], ['files', 'Files'], ['backups', 'Backups'], ['settings', 'Settings']].map(([path, label]) => (
              <Tab key={path} value={path} label={label} component={Link} to={`/${server.id}${path ? `/${path}` : ''}`} />
            ))}
          </Tabs>
          {page === 'files' ? <ServerFiles server={server} /> : page === 'backups' ? <ServerBackups server={server} /> : page === 'settings' ? <ServerSettings server={server} /> : page !== '' ? <Typography color="text.secondary">Page not found</Typography> : (
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
          )}
        </>
      )}
    </Stack>
  )
}
