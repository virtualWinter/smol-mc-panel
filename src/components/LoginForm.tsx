'use client'

import { useState } from 'react'
import { Alert, Button, Paper, Stack, TextField, Typography } from '@mui/material'
import { login } from '../server/auth-actions'

export default function LoginForm() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  return (
    <Paper component="form" data-panel-auth variant="outlined" sx={{ maxWidth: 400, mx: 'auto', my: { xs: 2, sm: 6 }, p: 3 }} onSubmit={async (event) => {
      event.preventDefault(); setPending(true); setError('')
      try { await login(username, password) } catch (error) { setError(String(error)); setPending(false) }
    }}>
      <Stack spacing={2.5}>
        <Typography component="h1" variant="h5" sx={{ fontWeight: 600 }}>Sign in</Typography>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField required disabled={pending} label="Username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} slotProps={{ htmlInput: { maxLength: 32 } }} />
        <TextField required disabled={pending} label="Password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} slotProps={{ htmlInput: { maxLength: 128 } }} />
        <Button type="submit" variant="contained" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</Button>
      </Stack>
    </Paper>
  )
}
