import { Box, Button, IconButton, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import type { SetupServerInput } from '../types'

interface Props {
  servers: SetupServerInput[]
  onChange: (servers: SetupServerInput[]) => void
  javaVersions: string[]
  disabled: boolean
}

export default function SetupServersEditor({ servers, onChange, javaVersions, disabled }: Props) {
  const change = (index: number, patch: Partial<SetupServerInput>) => onChange(servers.map((server, position) => position === index ? { ...server, ...patch } : server))
  return (
    <Stack spacing={2}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography component="h2" variant="subtitle2">Paper servers</Typography>
        <Button type="button" startIcon={<AddIcon />} disabled={disabled || servers.length >= 20} onClick={() => {
          let number = 1, port = 25566
          while (servers.some((server) => server.id === `server-${number}`)) number++
          while (servers.some((server) => server.port === port)) port++
          onChange([...servers, { id: `server-${number}`, name: `Server ${number}`, port, maxMemory: 2048, javaVersion: 'Java 25' }])
        }}>Add server</Button>
      </Stack>
      {servers.map((server, index) => (
        <Paper key={index} variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={2}>
            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">{server.name || `Server ${index + 1}`}</Typography>
              <IconButton size="small" aria-label={`Remove server ${index + 1}`} disabled={disabled} onClick={() => onChange(servers.filter((_, position) => position !== index))}><CloseIcon fontSize="small" /></IconButton>
            </Stack>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              <TextField required disabled={disabled} label="Name" value={server.name} onChange={(event) => change(index, { name: event.target.value })} slotProps={{ htmlInput: { maxLength: 80 } }} />
               <TextField required disabled={disabled} label="ID" value={server.id} onChange={(event) => change(index, { id: event.target.value })} slotProps={{ htmlInput: { pattern: '[a-z0-9][a-z0-9_\\-]{0,63}', maxLength: 64 } }} />
              <TextField required disabled={disabled} label="Port" type="number" value={server.port || ''} onChange={(event) => change(index, { port: Number(event.target.value) })} slotProps={{ htmlInput: { min: 1024, max: 65535, step: 1 } }} />
              <TextField required disabled={disabled} label="Maximum memory (MiB)" type="number" value={server.maxMemory || ''} onChange={(event) => change(index, { maxMemory: Number(event.target.value) })} slotProps={{ htmlInput: { min: 256, max: 1048576, step: 1 } }} />
              <TextField select disabled={disabled} label="Java version" value={server.javaVersion} onChange={(event) => change(index, { javaVersion: event.target.value })}>
                {javaVersions.map((version) => <MenuItem key={version} value={version}>{version}</MenuItem>)}
              </TextField>
            </Box>
          </Stack>
        </Paper>
      ))}
      {!servers.length && <Typography variant="body2" color="text.secondary">Add a server to continue.</Typography>}
    </Stack>
  )
}
