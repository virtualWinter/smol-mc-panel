import { Box, Chip, Paper, Stack, Typography } from '@mui/material'
import DnsOutlinedIcon from '@mui/icons-material/DnsOutlined'
import { Link } from 'react-router-dom'

import type { ServerProps } from '../types'

export default function ServerCard({ server }: ServerProps) {
  const online = server.status === 'Online'

  return (
    <Paper component={Link} to={`/${server.id}`} variant="outlined" sx={{ p: 1.5, borderRadius: 1, display: 'block', color: 'inherit', textDecoration: 'none', '&:hover': { borderColor: 'text.secondary' }, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' } }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}>
        <Stack direction="row" spacing={1.5} sx={{ flex: 1, alignItems: 'center' }}>
          <Box sx={{ p: 1, display: 'flex', bgcolor: 'action.hover', borderRadius: 1 }}>
            <DnsOutlinedIcon color={online ? 'primary' : 'disabled'} />
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 600 }}>{server.name}</Typography>
            <Typography variant="body2" color="text.secondary">{server.address}</Typography>
          </Box>
        </Stack>
        <Stack direction="row" spacing={3} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="caption" color="text.secondary">Memory</Typography>
            <Typography variant="body2">{server.memory}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Players</Typography>
            <Typography variant="body2">{server.players}</Typography>
          </Box>
          <Chip label={server.status} size="small" color={online ? 'success' : 'default'} variant="outlined" sx={{ minWidth: 72 }} />
        </Stack>
      </Stack>
    </Paper>
  )
}
