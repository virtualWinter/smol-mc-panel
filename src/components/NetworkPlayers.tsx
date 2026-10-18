import { useState } from 'react'
import { Alert, Button, Dialog, DialogTitle, DialogContent, DialogActions, Stack, Typography, TextField, MenuItem } from '@mui/material'
import { usePanel } from '../data/usePanel'
import type { PlayerAction } from '../server/players'

export default function NetworkPlayers() {
  const { networkPlayers, playerPolicy, managePlayer, servers } = usePanel()
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [name, setName] = useState(''), [action, setAction] = useState<PlayerAction>('kick')
  async function run(operation: () => Promise<void>) { setBusy(true); setError(''); try { await operation() } catch (error) { setError(String(error)) } finally { setBusy(false) } }
  return <>
    <Button size="small" onClick={() => setOpen(true)}>Players ({new Set(networkPlayers.map((p) => p.uuid)).size})</Button>
    <Dialog open={open} fullWidth maxWidth="sm" onClose={() => { if (!busy) setOpen(false) }}><DialogTitle>Network players</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      {error && <Alert severity="error">{error}</Alert>}
      <Typography variant="caption" color="text.secondary">Online players come from live agent telemetry. Bans apply to all Paper backends, including offline and newly created servers. Paper whitelisting is always disabled.</Typography>
      {networkPlayers.map((p) => <Stack key={`${p.serverId}:${p.uuid}`} direction="row" spacing={1} sx={{ alignItems: 'center' }}><Typography sx={{ flex: 1 }} variant="body2">{p.name} · {servers.find((s) => s.id === p.serverId)?.name ?? p.serverId} · {p.ping} ms</Typography><Button disabled={busy} onClick={() => setName(p.name)}>Select</Button></Stack>)}
      {!networkPlayers.length && <Typography color="text.secondary">No online players reported.</Typography>}
      <TextField label="Minecraft username" disabled={busy} value={name} onChange={(e) => setName(e.target.value)} />
      <TextField select label="Network action" disabled={busy} value={action} onChange={(e) => setAction(e.target.value as PlayerAction)}>{[['kick', 'Kick'], ['ban', 'Ban'], ['unban', 'Unban']].map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
      <Button disabled={busy || !name} onClick={() => { if (window.confirm(`Apply ${action} to ${name} across the network?`)) void run(() => managePlayer(action, name)) }}>Apply</Button>
      <Typography variant="body2">Network bans: {playerPolicy.banned.map((p) => p.name).join(', ') || 'None'}</Typography>
    </Stack></DialogContent><DialogActions><Button disabled={busy} onClick={() => setOpen(false)}>Close</Button></DialogActions></Dialog>
  </>
}
