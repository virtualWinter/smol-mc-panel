import { useState } from 'react'
import { Alert, Button, Chip, Dialog, DialogTitle, DialogContent, DialogActions, Stack, Typography, TextField, MenuItem, List, ListItemButton, ListItemText } from '@mui/material'
import { usePanel } from '../data/usePanel'
import type { PlayerAction } from '../server/players'

export default function NetworkPlayers() {
  const { networkPlayers, playerPolicy, managePlayer, servers } = usePanel()
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [name, setName] = useState(''), [action, setAction] = useState<PlayerAction>('kick')
  const [notice, setNotice] = useState('')
  async function apply() {
    if (!window.confirm(`${action === 'kick' ? 'Kick' : action === 'ban' ? 'Ban' : 'Unban'} ${name} across the network?`)) return
    setBusy(true); setError(''); setNotice('')
    try { await managePlayer(action, name); setNotice('Action requested'); setName('') } catch (error) { setError(String(error)) } finally { setBusy(false) }
  }
  return <>
    <Button size="small" onClick={() => setOpen(true)}>Players ({new Set(networkPlayers.map((p) => p.uuid)).size})</Button>
    <Dialog open={open} fullWidth maxWidth="sm" onClose={() => { if (!busy) setOpen(false) }}><DialogTitle>Players</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      {error && <Alert severity="error">{error}</Alert>}
      {notice && <Typography variant="body2" color="text.secondary" role="status">{notice}</Typography>}
      {networkPlayers.length ? <List disablePadding>{networkPlayers.map((p) => <ListItemButton key={`${p.serverId}:${p.uuid}`} disabled={busy} selected={name === p.name} onClick={() => { setName(p.name); setNotice('') }} sx={{ borderRadius: 1 }}><ListItemText primary={p.name} secondary={servers.find((s) => s.id === p.serverId)?.name ?? p.serverId} /><Typography variant="caption" color="text.secondary">{p.ping} ms</Typography></ListItemButton>)}</List> : <Typography variant="body2" color="text.secondary">No players online</Typography>}
      <Stack component="form" id="player-action" direction={{ xs: 'column', sm: 'row' }} spacing={1} onSubmit={(e) => { e.preventDefault(); void apply() }}>
        <TextField required label="Username" disabled={busy} value={name} onChange={(e) => { setName(e.target.value); setNotice('') }} sx={{ flex: 1 }} slotProps={{ htmlInput: { pattern: '[a-zA-Z0-9_]{1,16}', maxLength: 16 } }} />
        <TextField select label="Action" disabled={busy} value={action} onChange={(e) => setAction(e.target.value as PlayerAction)} sx={{ minWidth: 120 }}>{[['kick', 'Kick'], ['ban', 'Ban'], ['unban', 'Unban']].map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
      </Stack>
      {playerPolicy.banned.length > 0 && <Stack spacing={1}><Typography variant="subtitle2">Banned</Typography><Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>{playerPolicy.banned.map((p) => <Chip key={p.uuid} label={p.name} disabled={busy} onClick={() => { setName(p.name); setAction('unban'); setNotice('') }} />)}</Stack></Stack>}
    </Stack></DialogContent><DialogActions><Button disabled={busy} onClick={() => setOpen(false)}>Close</Button><Button variant="contained" color={action === 'ban' ? 'error' : 'primary'} type="submit" form="player-action" disabled={busy || !name}>{busy ? 'Working…' : action === 'kick' ? 'Kick player' : action === 'ban' ? 'Ban player' : 'Unban player'}</Button></DialogActions></Dialog>
  </>
}
