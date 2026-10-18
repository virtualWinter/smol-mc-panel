'use client'

import { useState } from 'react'
import { Alert, Button, Divider, Paper, Stack, TextField, Typography } from '@mui/material'
import { setupPanel } from '../server/auth-actions'
import SetupServersEditor from './SetupServersEditor'
import type { SetupServerInput } from '../types'

export default function SetupForm({ existingProxy, javaVersions }: { existingProxy?: 'velocity'; javaVersions: string[] }) {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [servers, setServers] = useState<SetupServerInput[]>([{ id: 'lobby', name: 'Lobby', port: 25566, maxMemory: 2048, javaVersion: 'Java 25' }])
  return (
    <Paper component="form" data-panel-auth variant="outlined" sx={{ maxWidth: existingProxy ? 440 : 680, mx: 'auto', my: { xs: 2, sm: 6 }, p: 3 }} onSubmit={async (event) => {
      event.preventDefault()
      if (password !== confirmation) { setError('Passwords do not match.'); return }
      setPending(true); setError('')
      try { await setupPanel(username, password, existingProxy ? [] : servers) } catch (error) { setError(String(error)); setPending(false) }
    }}>
      <Stack spacing={2.5}>
        <Stack spacing={0.5}>
          <Typography component="h1" variant="h5" sx={{ fontWeight: 600 }}>Set up your network</Typography>
          <Typography variant="body2" color="text.secondary">{existingProxy ? 'Create the admin account for your existing network.' : 'Create your admin account, proxy, and servers.'}</Typography>
        </Stack>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField required label="Admin username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} slotProps={{ htmlInput: { maxLength: 32, pattern: '[a-zA-Z0-9._\\-]+' } }} />
        <TextField required label="Password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} slotProps={{ htmlInput: { minLength: 12, maxLength: 128 } }} helperText="At least 12 characters" />
        <TextField required label="Confirm password" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
        {!existingProxy && <><Divider /><SetupServersEditor servers={servers} onChange={setServers} javaVersions={javaVersions} disabled={pending} /></>}
        <Button type="submit" variant="contained" disabled={pending || (!existingProxy && !servers.length)}>{pending ? 'Setting up…' : existingProxy ? 'Create admin account' : 'Create network'}</Button>
      </Stack>
    </Paper>
  )
}
