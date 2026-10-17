import { Box, Divider, Paper, Stack, Typography } from '@mui/material'

import type { ServerProps } from '../types'

export default function ServerStats({ server }: ServerProps) {
  return (
    <Paper variant="outlined" sx={{ width: '100%' }}>
    <Stack divider={<Divider />}>
      {Object.entries({ CPU: server.cpu, Memory: server.memory, Players: server.players }).map(([label, value]) => (
        <Box key={label} sx={{ px: 2, py: 1.25 }}>
          <Typography variant="caption" color="text.secondary">{label}</Typography>
          <Typography sx={{ mt: 0.5, overflowWrap: 'anywhere' }}>{value}</Typography>
        </Box>
      ))}
    </Stack>
    </Paper>
  )
}
