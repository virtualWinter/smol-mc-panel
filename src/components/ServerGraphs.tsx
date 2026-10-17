import { Box, Paper, Stack, Typography } from '@mui/material'
import { usePanel } from '../data/usePanel'
import type { ServerProps } from '../types'

export default function ServerGraphs({ server }: ServerProps) {
  const { metrics } = usePanel()
  const history = metrics[server.id]
  if (!history) return null
  const graphs = [
    { label: 'CPU', values: history.cpu, max: Math.max(100, ...history.cpu), value: server.cpu },
    { label: 'RAM', values: history.ram, max: server.maxMemory, value: server.memory },
    { label: 'Players', values: history.players, max: Math.max(10, ...history.players), value: server.players },
    history.network
      ? { label: 'Network', values: history.network, max: Math.max(1, ...history.network) * 1.2, value: history.network.length ? `${history.network.at(-1)} KB/s` : '—' }
      : { label: 'TPS', values: history.tps, max: 20, value: server.status === 'Online' && history.tps.length ? `${history.tps.at(-1)?.toFixed(1)} / 20` : '—' },
  ]

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 2 }}>
      {graphs.map(({ label, values, max, value }) => {
        const points = values.map((sample, index) => `${index / Math.max(1, values.length - 1) * 280},${76 - Math.min(1, Math.max(0, sample / max)) * 68}`).join(' ')
        return (
          <Paper key={label} variant="outlined" sx={{ p: 1.5, minWidth: 0 }}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
              <Typography variant="caption" color="text.secondary">{label}</Typography>
              <Typography variant="body2">{value}</Typography>
            </Stack>
            {values.length ? (
              <Box component="svg" viewBox="0 0 280 84" role="img" aria-label={`${label} history: ${values.join(', ')}`} sx={{ display: 'block', width: '100%', height: 84, color: 'primary.main', mt: 1 }} preserveAspectRatio="none">
                {[8, 42, 76].map((y) => <line key={y} x1="0" x2="280" y1={y} y2={y} stroke="currentColor" opacity="0.1" />)}
                <polygon points={`0,76 ${points} 280,76`} fill="currentColor" opacity="0.08" />
                <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
              </Box>
            ) : <Stack sx={{ height: 92, justifyContent: 'center' }}><Typography variant="caption" color="text.secondary">{label === 'Network' ? 'Not available' : 'Waiting for samples'}</Typography></Stack>}
          </Paper>
        )
      })}
    </Box>
  )
}
