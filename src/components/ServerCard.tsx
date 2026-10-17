import { Box, Stack, Typography } from '@mui/material'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import HubOutlinedIcon from '@mui/icons-material/HubOutlined'
import DnsOutlinedIcon from '@mui/icons-material/DnsOutlined'
import { Link } from 'react-router-dom'
import type { ServerProps } from '../types'

export default function ServerCard({ server }: ServerProps) {
  return (
    <Box component={Link} to={`/${server.id}`} sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr) auto', sm: 'minmax(0, 1fr) 140px 110px 24px' }, alignItems: 'center', gap: 2, px: 2, py: 1.5, color: 'inherit', textDecoration: 'none', '&:hover': { bgcolor: 'action.hover' }, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 } }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', minWidth: 0 }}>
        <Box sx={{ position: 'relative', display: 'flex', color: 'text.secondary', flexShrink: 0 }}>
          {server.id === 'proxy' ? <HubOutlinedIcon fontSize="small" titleAccess="Proxy" /> : <DnsOutlinedIcon fontSize="small" titleAccess="Server" />}
          <Box role="img" aria-label={server.status} sx={{ position: 'absolute', right: -3, bottom: -2, width: 7, height: 7, borderRadius: '50%', bgcolor: server.status === 'Online' ? 'success.main' : 'text.disabled', outline: '2px solid', outlineColor: 'background.paper' }} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{server.name}</Typography>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{server.address}</Typography>
        </Box>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>{server.memory} RAM</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>{server.players} players</Typography>
      <ChevronRightIcon fontSize="small" sx={{ color: 'text.disabled' }} />
    </Box>
  )
}
