'use client'

import { useState } from 'react'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, MenuItem } from '@mui/material'
import { usePanel } from '../data/usePanel'
import type { SetupServerInput } from '../types'

export default function NetworkServers() {
  const { servers, javaVersions, addServer, removeServer } = usePanel()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [input, setInput] = useState<SetupServerInput>({ id: '', name: '', port: 25568, maxMemory: 2048, javaVersion: 'Java 25' })
  const [removeId, setRemoveId] = useState('')
  async function run(operation: () => Promise<unknown>) {
    setBusy(true); setError('')
    try { await operation(); setOpen(false); setRemoveId('') } catch (error) { setError(String(error)) }
    finally { setBusy(false) }
  }
  return <>
    <Button size="small" onClick={() => { setError(''); setOpen(true) }}>Manage servers</Button>
    <Dialog open={open} onClose={() => { if (!busy) setOpen(false) }} fullWidth maxWidth="sm">
      <DialogTitle>Paper servers</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        <Alert severity="info">Stop Velocity before changing routing. Removed servers must also be stopped; their files and backups are kept. New servers require a JAR and EULA acceptance.</Alert>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField label="Name" disabled={busy} value={input.name} onChange={(e) => setInput({ ...input, name: e.target.value })} />
        <TextField label="ID" disabled={busy} value={input.id} onChange={(e) => setInput({ ...input, id: e.target.value })} />
        <TextField label="Port" disabled={busy} type="number" value={input.port} onChange={(e) => setInput({ ...input, port: Number(e.target.value) })} />
        <TextField label="Maximum memory (MiB)" disabled={busy} type="number" value={input.maxMemory} onChange={(e) => setInput({ ...input, maxMemory: Number(e.target.value) })} />
        <TextField select label="Java" disabled={busy} value={input.javaVersion} onChange={(e) => setInput({ ...input, javaVersion: e.target.value })}>{javaVersions.map((version) => <MenuItem key={version} value={version}>{version}</MenuItem>)}</TextField>
        <Button disabled={busy} onClick={() => void run(() => addServer(input))}>Create backend</Button>
        <TextField select label="Remove backend" disabled={busy} value={removeId} onChange={(e) => setRemoveId(e.target.value)}>{servers.filter((s) => s.kind === 'paper').map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}</TextField>
        <Button color="error" disabled={busy || !removeId} onClick={() => { if (window.confirm(`Unregister ${removeId}? Files and backups will be kept.`)) void run(() => removeServer(removeId)) }}>Remove from network</Button>
      </Stack></DialogContent>
      <DialogActions><Button disabled={busy} onClick={() => setOpen(false)}>Close</Button></DialogActions>
    </Dialog>
  </>
}
