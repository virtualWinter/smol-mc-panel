'use client'

import { useState } from 'react'
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, MenuItem, Tabs, Tab, Typography } from '@mui/material'
import { usePanel } from '../data/usePanel'
import type { SetupServerInput } from '../types'

export default function NetworkServers() {
  const { servers, javaVersions, addServer, removeServer } = usePanel()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('add')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [input, setInput] = useState<SetupServerInput>({ id: '', name: '', port: 25568, maxMemory: 2048, javaVersion: 'Java 25' })
  const [removeId, setRemoveId] = useState('')
  const backends = servers.filter((s) => s.kind === 'paper')
  const proxy = servers.find((s) => s.kind === 'velocity')
  const proxyRunning = proxy?.status !== 'Offline'
  const liveUpdates = proxy?.telemetry?.proxyTopology === true
  const selected = backends.find((s) => s.id === removeId)
  async function run(operation: () => Promise<unknown>) {
    setBusy(true); setError('')
    try { await operation(); setOpen(false); setRemoveId(''); setInput({ ...input, id: '', name: '' }) } catch (error) { setError(String(error)) }
    finally { setBusy(false) }
  }
  return <>
    <Button size="small" onClick={() => { setError(''); setOpen(true); let port = 25566; while (servers.some((s) => s.address.endsWith(`:${port}`))) port++; setInput({ ...input, port }) }}>Manage servers</Button>
    <Dialog open={open} onClose={() => { if (!busy) setOpen(false) }} fullWidth maxWidth="sm">
      <DialogTitle>Servers</DialogTitle>
      <DialogContent><Stack spacing={2}>
        <Tabs value={tab} onChange={(_, value: string) => { setTab(value); setError('') }} aria-label="Manage servers"><Tab label="Add" value="add" disabled={busy} /><Tab label="Remove" value="remove" disabled={busy} /></Tabs>
        {proxyRunning && <Typography variant="caption" color="text.secondary">{liveUpdates ? 'Velocity applies server changes immediately.' : 'Restart Velocity once to apply server changes without stopping it.'}</Typography>}
        {error && <Alert severity="error">{error}</Alert>}
        {tab === 'add' ? <Stack component="form" id="add-backend" spacing={2} onSubmit={(e) => { e.preventDefault(); void run(() => addServer(input)) }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            <TextField required label="Name" disabled={busy} value={input.name} onChange={(e) => setInput({ ...input, name: e.target.value })} />
            <TextField required label="ID" disabled={busy} value={input.id} onChange={(e) => setInput({ ...input, id: e.target.value })} slotProps={{ htmlInput: { pattern: '[a-z0-9][a-z0-9_\\-]{0,63}', maxLength: 64 } }} />
            <TextField required label="Port" disabled={busy} type="number" value={input.port} onChange={(e) => setInput({ ...input, port: Number(e.target.value) })} slotProps={{ htmlInput: { min: 1024, max: 65535 } }} />
            <TextField required label="Memory (MiB)" disabled={busy} type="number" value={input.maxMemory} onChange={(e) => setInput({ ...input, maxMemory: Number(e.target.value) })} slotProps={{ htmlInput: { min: 256 } }} />
          </Box>
          <TextField select label="Java" disabled={busy} value={input.javaVersion} onChange={(e) => setInput({ ...input, javaVersion: e.target.value })}>{javaVersions.map((version) => <MenuItem key={version} value={version}>{version}</MenuItem>)}</TextField>
        </Stack> : <>
          <TextField select label="Server" disabled={busy} value={removeId} onChange={(e) => setRemoveId(e.target.value)}>{backends.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}</TextField>
          <Typography variant="caption" color="text.secondary">Files and backups are kept.</Typography>
          {selected && selected.status !== 'Offline' && <Alert severity="info">Stop {selected.name} before removing it.</Alert>}
          {backends.length <= 1 && <Typography variant="caption" color="text.secondary">Keep at least one backend.</Typography>}
        </>}
      </Stack></DialogContent>
      <DialogActions><Button disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>{tab === 'add' ? <Button variant="contained" type="submit" form="add-backend" disabled={busy}>{busy ? 'Creating…' : 'Add server'}</Button> : <Button color="error" variant="contained" disabled={busy || selected?.status !== 'Offline' || backends.length <= 1} onClick={() => { if (window.confirm(`Remove ${selected?.name} from the network? Files and backups are kept.`)) void run(() => removeServer(removeId)) }}>{busy ? 'Removing…' : 'Remove server'}</Button>}</DialogActions>
    </Dialog>
  </>
}
