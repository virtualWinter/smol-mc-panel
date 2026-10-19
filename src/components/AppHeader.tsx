'use client'

import { useState } from 'react'
import { Alert, AppBar, Box, Container, Divider, IconButton, Snackbar, Stack, Toolbar, Tooltip, Typography } from '@mui/material'
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined'
import ViewInArOutlinedIcon from '@mui/icons-material/ViewInArOutlined'
import { logout } from '../server/auth-actions'
import NetworkPlayers from './NetworkPlayers'
import NetworkPermissions from './NetworkPermissions'

function Brand() {
  return (
    <Stack component="a" href="/" direction="row" spacing={1} sx={{ alignItems: 'center', textDecoration: 'none', color: 'inherit', minWidth: 0 }}>
      <Box sx={{ width: 30, height: 30, borderRadius: 1.5, display: 'grid', placeItems: 'center', bgcolor: 'primary.main', color: 'primary.contrastText', flexShrink: 0 }}>
        <ViewInArOutlinedIcon sx={{ fontSize: 19 }} />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, fontSize: 15, lineHeight: 1.2, letterSpacing: '-0.01em' }}>smol panel</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: 11, lineHeight: 1.2 }}>Minecraft network</Typography>
      </Box>
    </Stack>
  )
}

/** The sticky app header. Rendered with only the brand before sign-in, and with the network
 * actions and account controls once an admin is signed in. */
export default function AppHeader({ user }: { user?: string }) {
  return (
    <AppBar position="sticky" elevation={0} color="transparent" sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider', backgroundImage: 'none' }}>
      <Container maxWidth="lg" sx={{ px: { xs: 2, sm: 4 } }}>
        <Toolbar disableGutters sx={{ minHeight: { xs: 56, sm: 60 }, gap: 1 }}>
          <Brand />
          <Box sx={{ flex: 1 }} />
          {user && <HeaderActions user={user} />}
        </Toolbar>
      </Container>
    </AppBar>
  )
}

function HeaderActions({ user }: { user: string }) {
  const [error, setError] = useState('')
  return (
    <>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
        <NetworkPlayers />
        <NetworkPermissions />
        <Divider orientation="vertical" flexItem sx={{ my: 1.5, mx: 0.5 }} />
        <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' }, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user}</Typography>
        <Tooltip title="Sign out"><IconButton size="small" aria-label="Sign out" onClick={() => { setError(''); void logout().catch((failure: unknown) => setError(String(failure))) }}><LogoutOutlinedIcon fontSize="small" /></IconButton></Tooltip>
      </Stack>
      <Snackbar open={Boolean(error)} autoHideDuration={6000} onClose={() => setError('')} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="error" onClose={() => setError('')}>{error}</Alert>
      </Snackbar>
    </>
  )
}
