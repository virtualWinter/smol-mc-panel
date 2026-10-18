import { Box, Divider, Paper, Stack, Typography } from '@mui/material'

import type { ServerProps } from '../types'

export default function ServerStats({ server }: ServerProps) {
  const agent = server.telemetry
  const rows: [string, string, string?][] = [
    ['CPU', server.cpu],
    ['Memory', server.memory],
    ['Players', server.players],
  ]
  if (agent) {
    if (agent.tps?.length) rows.push(['TPS', `${agent.tps[0].toFixed(2)} / 20${agent.mspt !== undefined ? ` · ${agent.mspt.toFixed(1)} ms tick` : ''}`])
    const worlds = agent.worlds ?? []
    if (worlds.length) rows.push(['Worlds', String(worlds.length), worlds.map((world) => world.name).join(' · ')])
  }
  return (
    <Paper variant="outlined" sx={{ width: '100%' }}>
    <Stack divider={<Divider />}>
      {rows.map(([label, value, detail]) => (
        <Box key={label} sx={{ px: 2, py: 1.25 }}>
          <Typography variant="caption" color="text.secondary">{label}</Typography>
          <Typography title={detail} sx={{ mt: 0.5, overflowWrap: 'anywhere' }}>{value}</Typography>
        </Box>
      ))}
    </Stack>
    </Paper>
  )
}
