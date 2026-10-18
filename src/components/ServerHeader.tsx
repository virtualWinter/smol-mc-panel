import { Box, Stack, Tab, Tabs, Typography } from '@mui/material'
import type { ServerProps } from '../types'

export default function ServerHeader({ server, page }: ServerProps & { page: string }) {
  return (
    <Stack spacing={2.5} sx={{ alignItems: 'flex-start' }}>
      <Stack spacing={0.5}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Typography component="h1" variant="h6" sx={{ fontWeight: 600, lineHeight: 1.4 }}>{server.name}</Typography>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: server.status === 'Online' ? 'success.main' : 'text.disabled' }} />
            <Typography variant="caption" color="text.secondary">{server.status}</Typography>
          </Stack>
        </Stack>
        <Typography variant="caption" color="text.secondary">{server.address}</Typography>
      </Stack>
      <Tabs value={['', 'files', 'plugins', 'backups', 'settings'].includes(page) ? page : false} variant="scrollable" scrollButtons="auto" aria-label="Server navigation" sx={{ maxWidth: '100%', borderBottom: 1, borderColor: 'divider', minHeight: 34, '& .MuiTab-root': { minHeight: 34, minWidth: 0, px: 1.5, py: 0.75, fontSize: 13 }, '& .MuiTabs-indicator': { height: 2, borderRadius: 1 } }}>
        {[['', 'Console'], ['files', 'Files'], ...(server.kind === 'paper' ? [['plugins', 'Plugins']] : []), ['backups', 'Backups'], ['settings', 'Settings']].map(([path, label]) => (
          <Tab key={path} value={path} label={label} component="a" href={`/${server.id}${path ? `/${path}` : ''}`} />
        ))}
      </Tabs>
    </Stack>
  )
}
