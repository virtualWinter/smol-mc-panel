'use client'

import { useState } from 'react'
import { Alert, AppBar, Box, Container, IconButton, Snackbar, Stack, Toolbar, Tooltip, Typography } from '@mui/material'
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined'
import ViewInArOutlinedIcon from '@mui/icons-material/ViewInArOutlined'
import { logout } from '../server/auth-actions'
import NetworkPlayers from './NetworkPlayers'
import NetworkPermissions from './NetworkPermissions'

function Brand() {
  return (
    <Stack component="a" href="/" direction="row" spacing={0.75} sx={{ alignItems: 'center', textDecoration: 'none', color: 'inherit' }}>
      <ViewInArOutlinedIcon sx={{ fontSize: 18, color: 'primary.main' }} />
      <Typography sx={{ fontWeight: 600, fontSize: 14, letterSpacing: '-0.01em' }}>smol panel</Typography>
    </Stack>
  )
}

/** The sticky app header. Rendered with only the brand before sign-in, and with the network
 * actions and sign-out control once an admin is signed in. */
export default function AppHeader({ user }: { user?: string }) {
  return (
    <AppBar position="sticky" elevation={0} color="transparent" sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider', backgroundImage: 'none' }}>
      <Container maxWidth="lg" sx={{ px: { xs: 2, sm: 4 } }}>
        <Toolbar disableGutters sx={{ minHeight: 48, gap: 1 }}>
          <Brand />
          <Box sx={{ flex: 1 }} />
          {user && <HeaderActions />}
        </Toolbar>
      </Container>
    </AppBar>
  )
}

function HeaderActions() {
  const [error, setError] = useState('')
  return (
    <>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
        <NetworkPlayers />
        <NetworkPermissions />
        <Tooltip title="Sign out"><IconButton size="small" aria-label="Sign out" onClick={() => { setError(''); void logout().catch((failure: unknown) => setError(String(failure))) }}><LogoutOutlinedIcon fontSize="small" /></IconButton></Tooltip>
      </Stack>
      <Snackbar open={Boolean(error)} autoHideDuration={6000} onClose={() => setError('')} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="error" onClose={() => setError('')}>{error}</Alert>
      </Snackbar>
    </>
  )
}
