import { useState } from 'react'
import { Alert, Button, Checkbox, FormControlLabel, Paper, Stack, TextField, Typography } from '@mui/material'
import { usePanel } from '../data/usePanel'
import type { ServerProps } from '../types'

export default function ServerBackups({ server }: ServerProps) {
  const { backups: allBackups, createBackup, deleteBackup, restoreBackup, refreshBackups, backupSchedules, saveBackupSchedule, backupJobs, s3Enabled } = usePanel()
  const schedule = backupSchedules[server.id]
  const [enabled, setEnabled] = useState(schedule?.enabled ?? false)
  const [hour, setHour] = useState(schedule?.hour ?? 4)
  const [retain, setRetain] = useState(schedule?.retain ?? 7)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const busy = pending || backupJobs.includes(server.id)
  async function run(operation: () => Promise<void>) {
    setError(''); setPending(true)
    try { await operation() } catch (error) { setError(String(error)) } finally { setPending(false) }
  }
  return <Stack spacing={2}>
    <Typography variant="body2" color="text.secondary">{s3Enabled ? 'Backups upload to S3. Failed uploads keep a local copy.' : 'Backups are local; S3 is not configured.'} Manual backup and restore require a stopped server.</Typography>
    <Stack direction="row" spacing={1}><Button variant="outlined" disabled={busy} onClick={() => void run(() => createBackup(server.id))}>Create backup</Button><Button disabled={busy} onClick={() => void run(() => refreshBackups(server.id))}>Refresh storage</Button></Stack>
    <Paper variant="outlined" sx={{ p: 2 }}><Stack spacing={2}>
      <FormControlLabel control={<Checkbox checked={enabled} disabled={busy} onChange={(e) => setEnabled(e.target.checked)} />} label="Daily backup" />
      <Stack direction="row" spacing={2}>
        <TextField label="Hour (UTC)" type="number" size="small" value={hour} disabled={busy} onChange={(e) => setHour(Number(e.target.value))} slotProps={{ htmlInput: { min: 0, max: 23 } }} />
        <TextField label="Keep latest backups" type="number" size="small" value={retain} disabled={busy} onChange={(e) => setRetain(Number(e.target.value))} slotProps={{ htmlInput: { min: 1, max: 100 } }} />
      </Stack>
      <Typography variant="caption" color="text.secondary">Scheduled backups stop a running server, archive it, then restart it. Retention deletes older backups, including manual ones, only after a successful scheduled backup. Missed schedules run once when the panel is available.</Typography>
      <Button disabled={busy} sx={{ alignSelf: 'flex-start' }} onClick={() => { if (!enabled || window.confirm('Enable daily backups with brief server downtime and deletion of backups beyond retention?')) void run(() => saveBackupSchedule(server.id, enabled, hour, retain)) }}>Save schedule</Button>
      {schedule?.lastRun && <Typography variant="caption">Last scheduled attempt: {schedule.lastRun} (UTC)</Typography>}
      {schedule?.error && <Alert severity="warning">{schedule.error}</Alert>}
    </Stack></Paper>
    {busy && <Alert severity="info">Backup operation in progress…</Alert>}
    {error && <Alert severity="error">{error}</Alert>}
    {(allBackups[server.id] ?? []).map((backup) => <Paper key={backup.id} variant="outlined" sx={{ p: 2 }}><Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
      <Stack sx={{ flex: 1 }}><Typography variant="body2">{backup.created}</Typography><Typography variant="caption" color="text.secondary">{backup.size} · {backup.storage ?? 'local'}</Typography></Stack>
      <Button disabled={busy} onClick={() => { if (window.confirm('Restore this backup? Stop the server first. Current files are preserved in a recovery directory; the server stays stopped.')) void run(() => restoreBackup(server.id, backup.id)) }}>Restore</Button>
      <Button disabled={busy} color="error" onClick={() => { if (window.confirm('Permanently delete this backup?')) void run(() => deleteBackup(server.id, backup.id)) }}>Delete</Button>
    </Stack></Paper>)}
    {!allBackups[server.id]?.length && <Typography color="text.secondary">No backups. Refresh storage to load S3 backups.</Typography>}
  </Stack>
}
