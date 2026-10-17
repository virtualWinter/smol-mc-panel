import { useState } from 'react'
import { Button, Paper, Stack, Typography } from '@mui/material'
import { usePanel } from '../data/usePanel'

import type { ServerProps } from '../types'

export default function ServerBackups({ server }: ServerProps) {
  const { backups: allBackups, createBackup, deleteBackup } = usePanel()
  const backups = allBackups[server.id] ?? []
  const [error, setError] = useState('')
  const run = (operation: Promise<void>) => { setError(''); void operation.catch((error: unknown) => setError(String(error))) }
  return (
    <Stack spacing={2}>
      <Button variant="outlined" sx={{ alignSelf: 'flex-start' }} onClick={() => run(createBackup(server.id))}>Create backup</Button>
      {error && <Typography color="error" role="alert">{error}</Typography>}
      {backups.length === 0 ? <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}><Typography color="text.secondary">No backups</Typography></Paper> : backups.map((backup) => (
        <Paper key={backup.id} variant="outlined" sx={{ p: 2 }}>
          <Stack direction="row" sx={{ justifyContent: 'space-between' }} spacing={2}>
            <Stack spacing={0.5}>
              <Typography variant="body2">{backup.name}</Typography>
              <Typography variant="caption" color="text.secondary">{backup.created}</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">{backup.size}</Typography>
            <Button color="error" size="small" onClick={() => run(deleteBackup(server.id, backup.id))}>Delete</Button>
          </Stack>
        </Paper>
      ))}
    </Stack>
  )
}
