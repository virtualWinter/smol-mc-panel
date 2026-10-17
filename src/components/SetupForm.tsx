'use client'

import { useState } from 'react'
import { Alert, Button, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material'
import { setupPanel } from '../server/auth-actions'

export default function SetupForm({ existingProxy }: { existingProxy?: 'velocity' | 'bungeecord' }) {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [kind, setKind] = useState<'velocity' | 'bungeecord'>(existingProxy ?? 'velocity')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  return (
    <Paper component="form" data-panel-auth variant="outlined" sx={{ maxWidth: 440, mx: 'auto', my: { xs: 2, sm: 6 }, p: 3 }} onSubmit={async (event) => {
      event.preventDefault()
      if (password !== confirmation) { setError('Passwords do not match.'); return }
      setPending(true); setError('')
      try { await setupPanel(username, password, kind) } catch (error) { setError(String(error)); setPending(false) }
    }}>
      <Stack spacing={2.5}>
        <Stack spacing={0.5}>
          <Typography component="h1" variant="h5" sx={{ fontWeight: 600 }}>Set up your network</Typography>
          <Typography variant="body2" color="text.secondary">Create the admin account and choose your proxy.</Typography>
        </Stack>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField required label="Admin username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} slotProps={{ htmlInput: { maxLength: 32, pattern: '[a-zA-Z0-9._\\-]+' } }} />
        <TextField required label="Password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} slotProps={{ htmlInput: { minLength: 12, maxLength: 128 } }} helperText="At least 12 characters" />
        <TextField required label="Confirm password" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
        <TextField select label="Proxy software" value={kind} disabled={Boolean(existingProxy)} onChange={(event) => setKind(event.target.value as 'velocity' | 'bungeecord')} helperText={existingProxy ? 'Existing network configuration will be kept.' : kind === 'bungeecord' ? 'BungeeCord requires a manually supplied JAR.' : undefined}>
          <MenuItem value="velocity">Velocity</MenuItem>
          <MenuItem value="bungeecord">BungeeCord</MenuItem>
        </TextField>
        <Button type="submit" variant="contained" disabled={pending}>{pending ? 'Setting up…' : 'Create network'}</Button>
      </Stack>
    </Paper>
  )
}
