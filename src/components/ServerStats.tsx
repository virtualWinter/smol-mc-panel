import { Box, Divider, Paper, Stack, Typography } from '@mui/material'

import type { ServerProps } from '../types'

const mib = (bytes: number) => `${(bytes / 1048576).toFixed(0)} MiB`

function uptime(ms: number) {
  const minutes = Math.floor(ms / 60000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h ${minutes % 60}m`
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}

export default function ServerStats({ server }: ServerProps) {
  const agent = server.telemetry
  const rows: [string, string][] = [
    ['CPU', server.cpu],
    ['Memory', server.memory],
    ['Players', server.players],
  ]
  if (agent) {
    if (agent.tps?.length) rows.push(['TPS', `${agent.tps.map((value) => value.toFixed(2)).join(' · ')} / 20 (1m/5m/15m)`])
    if (agent.mspt !== undefined) rows.push(['Tick time', `${agent.mspt.toFixed(1)} ms average`])
    if (agent.serverVersion) rows.push(['Version', agent.serverVersion])
    rows.push(['JVM heap', `${mib(agent.heapUsed)} used · ${mib(agent.heapCommitted)} committed · ${mib(agent.heapMax)} max`])
    rows.push(['Runtime', `Java ${agent.javaVersion} · up ${uptime(agent.uptime)} · ${agent.threads} threads`])
    if (agent.players?.length) rows.push(['Online', agent.players.slice(0, 10).map((player) => `${player.name} (${player.ping} ms)`).join(', ')])
    for (const world of agent.worlds ?? []) rows.push([`World ${world.name}`, `${world.players} players · ${world.entities} entities · ${world.chunks} chunks`])
  }
  return (
    <Paper variant="outlined" sx={{ width: '100%' }}>
    <Stack divider={<Divider />}>
      {rows.map(([label, value]) => (
        <Box key={label} sx={{ px: 2, py: 1.25 }}>
          <Typography variant="caption" color="text.secondary">{label}</Typography>
          <Typography sx={{ mt: 0.5, overflowWrap: 'anywhere' }}>{value}</Typography>
        </Box>
      ))}
    </Stack>
    </Paper>
  )
}
