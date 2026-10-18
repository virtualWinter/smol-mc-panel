import { useState } from 'react'
import { Accordion, AccordionDetails, AccordionSummary, Alert, Button, Chip, FormControlLabel, Paper, Stack, Switch, TextField, Typography, Divider } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { usePanel } from '../data/usePanel'
import type { ServerProps } from '../types'
import { displayDate } from './ui-format'

export default function ServerBackups({ server }: ServerProps) {
  const { backups: allBackups, createBackup, deleteBackup, restoreBackup, refreshBackups, backupSchedules, saveBackupSchedule, backupJobs, s3Enabled } = usePanel()
  const schedule = backupSchedules[server.id]
  const [enabled, setEnabled] = useState(schedule?.enabled ?? false)
  const [hour, setHour] = useState(schedule?.hour ?? 4)
  const [retain, setRetain] = useState(schedule?.retain ?? 7)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const busy = pending || backupJobs.includes(server.id)
  const stopped = server.status === 'Offline'
  const backups = allBackups[server.id] ?? []
  async function run(operation: () => Promise<void>) {
    setError(''); setPending(true)
    try { await operation() } catch (error) { setError(String(error)) } finally { setPending(false) }
  }
  return <Stack spacing={2}>
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}><Button variant="outlined" disabled={busy || !stopped} onClick={() => void run(() => createBackup(server.id))}>Create backup</Button><Button disabled={busy} onClick={() => void run(() => refreshBackups(server.id))}>Refresh</Button><Chip size="small" variant="outlined" label={s3Enabled ? 'S3' : 'Local'} /></Stack>
    {!stopped && <Typography variant="caption" color="text.secondary">Stop the server to back up or restore.</Typography>}
    <Accordion variant="outlined" disableGutters sx={{ '&:before': { display: 'none' } }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography variant="body2">Daily backups · {schedule?.enabled ? `${String(schedule.hour).padStart(2, '0')}:00 UTC` : 'Off'}</Typography></AccordionSummary>
      <AccordionDetails><Stack spacing={2}>
        <FormControlLabel control={<Switch checked={enabled} disabled={busy} onChange={(e) => setEnabled(e.target.checked)} />} label="Enabled" />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField label="Hour (UTC)" type="number" value={hour} disabled={busy || !enabled} onChange={(e) => setHour(Number(e.target.value))} slotProps={{ htmlInput: { min: 0, max: 23 } }} />
          <TextField label="Keep latest" type="number" value={retain} disabled={busy || !enabled} onChange={(e) => setRetain(Number(e.target.value))} slotProps={{ htmlInput: { min: 1, max: 100 } }} />
        </Stack>
        <Typography variant="caption" color="text.secondary">Briefly stops the server. Retention includes manual backups.</Typography>
        <Button disabled={busy} sx={{ alignSelf: 'flex-start' }} onClick={() => { if (!enabled || window.confirm(`Back up daily at ${hour}:00 UTC and keep ${retain} backups? Running servers briefly stop. Older backups, including manual ones, are deleted after success.`)) void run(() => saveBackupSchedule(server.id, enabled, hour, retain)) }}>Save schedule</Button>
        {schedule?.lastRun && <Typography variant="caption" color="text.secondary">Last attempt: {schedule.lastRun}</Typography>}
      </Stack></AccordionDetails>
    </Accordion>
    {schedule?.error && <Alert severity="warning">{schedule.error}</Alert>}
    {busy && <Typography variant="body2" color="text.secondary" role="status">Working…</Typography>}
    {error && <Alert severity="error">{error}</Alert>}
    {backups.length > 0 ? <Paper variant="outlined"><Stack divider={<Divider />}>
      {backups.map((backup) => <Stack key={backup.id} direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ p: 1.5, alignItems: { sm: 'center' } }}>
        <Stack sx={{ flex: 1 }}><Typography variant="body2" title={backup.created}>{displayDate(backup.created)}</Typography><Typography variant="caption" color="text.secondary">{backup.size} · {(backup.storage ?? 'local').toUpperCase()}</Typography></Stack>
        <Stack direction="row" spacing={1}><Button disabled={busy || !stopped} onClick={() => { if (window.confirm('Restore this backup? Current files are kept in a recovery directory. The server will stay stopped.')) void run(() => restoreBackup(server.id, backup.id)) }}>Restore</Button><Button disabled={busy} color="error" onClick={() => { if (window.confirm('Permanently delete this backup?')) void run(() => deleteBackup(server.id, backup.id)) }}>Delete</Button></Stack>
      </Stack>)}
    </Stack></Paper> : <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>No backups</Typography>}
  </Stack>
}
