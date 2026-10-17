import { useState } from 'react'
import { Button, Paper, Stack, Typography } from '@mui/material'
import { serverBackups } from '../data/mockData'

import type { ServerProps } from '../types'

export default function ServerBackups({ server }: ServerProps) {
  const [backups, setBackups] = useState(serverBackups[server.id] ?? [])
  return (
    <Stack spacing={2}>
      <Button variant="outlined" sx={{ alignSelf: 'flex-start' }} onClick={() => setBackups([...backups, { id: crypto.randomUUID(), name: 'Manual backup', created: new Date().toISOString(), size: '0 B (mock)' }])}>Create backup</Button>
      {backups.length === 0 ? <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}><Typography color="text.secondary">No backups</Typography></Paper> : backups.map((backup) => (
        <Paper key={backup.id} variant="outlined" sx={{ p: 2 }}>
          <Stack direction="row" sx={{ justifyContent: 'space-between' }} spacing={2}>
            <Stack spacing={0.5}>
              <Typography variant="body2">{backup.name}</Typography>
              <Typography variant="caption" color="text.secondary">{backup.created}</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">{backup.size}</Typography>
            <Button color="error" size="small" onClick={() => setBackups(backups.filter((item) => item.id !== backup.id))}>Delete</Button>
          </Stack>
        </Paper>
      ))}
      <Typography variant="caption" color="text.secondary">Mock backups · No actual files are backed up.</Typography>
    </Stack>
  )
}
