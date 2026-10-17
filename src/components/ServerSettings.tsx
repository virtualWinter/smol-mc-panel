import { useState } from 'react'
import { Box, Button, FormControlLabel, MenuItem, Paper, Stack, Switch, TextField, Typography } from '@mui/material'
import { usePanel } from '../data/usePanel'
import type { ServerProps, Server } from '../types'
import type { TextFieldProps } from '@mui/material'
import DownloadProgress from './DownloadProgress'

function SettingsForm({ server }: ServerProps) {
  const { saveSettings, acceptEula, reinstallServer, javaVersions } = usePanel()
  const [values, setValues] = useState(server)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [reinstalling, setReinstalling] = useState(false)
  const downloadActive = server.download && !['complete', 'failed'].includes(server.download.phase)
  const change = (field: keyof Server, value: string | boolean) => {
    setValues((current) => ({ ...current, [field]: value }))
    setSaved(false)
    setError('')
  }
  const field = (name: keyof Server, label: string, extra: TextFieldProps = {}) => (
    <TextField required fullWidth size="small" label={label} value={values[name]} onChange={(event) => change(name, event.target.value)} {...extra} />
  )
  const columns = { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }

  return (
    <Stack component="form" spacing={2} onSubmit={async (event) => {
      event.preventDefault()
      if (Number(values.minMemory) > Number(values.maxMemory)) {
        setError('Initial memory cannot exceed maximum memory.')
        return
      }
      try { await saveSettings(server.id, {
        ...values,
        name: values.name.trim(), address: values.address.trim(),
        minMemory: Number(values.minMemory), maxMemory: Number(values.maxMemory),
      })
      setSaved(true) } catch (error) { setError(String(error)) }
    }}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 600 }}>General</Typography>
          <Box sx={columns}>
            {field('name', 'Server name')}
            {field('address', 'Address', { slotProps: { input: { readOnly: true } } })}
          </Box>
          {field('workingDirectory', 'Working directory', { slotProps: { input: { readOnly: true } } })}
        </Stack>
      </Paper>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={1.5} sx={{ alignItems: 'flex-start' }}>
          <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 600 }}>Server JAR</Typography>
          <Typography variant="body2" color="text.secondary">{server.kind === 'bungeecord' ? 'Upload the BungeeCord JAR in Files.' : `${server.jarVersion ?? 'Latest stable release on first install'}. Worlds, plugins, and settings are kept.`}</Typography>
          <Button type="button" variant="outlined" disabled={server.kind === 'bungeecord' || reinstalling || downloadActive || server.status !== 'Offline'} onClick={async () => {
            const version = server.jarVersion ?? 'the latest stable release (this may change the Minecraft version and Java requirements; back up your worlds first)'
            if (!window.confirm(`Download ${version} and replace ${server.jarFile}? Other server files will not be deleted.`)) return
            setReinstalling(true); setError('')
            try { await reinstallServer(server.id) }
            catch (error) { setError(String(error)) }
            finally { setReinstalling(false) }
          }}>{reinstalling || downloadActive ? 'Reinstalling…' : 'Reinstall'}</Button>
          {((server.download && !server.download.label?.startsWith('Java')) || reinstalling) && <DownloadProgress progress={reinstalling && !downloadActive ? { phase: 'resolving', received: 0, total: 0, bytesPerSecond: 0 } : server.download ?? { phase: 'resolving', received: 0, total: 0, bytesPerSecond: 0 }} />}
        </Stack>
      </Paper>
      {server.kind === 'paper' && !server.eulaAccepted && <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={1.5} sx={{ alignItems: 'flex-start' }}>
          <Typography variant="body2">Paper requires acceptance of the <a href="https://aka.ms/MinecraftEULA" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>Minecraft EULA</a>.</Typography>
          <Button variant="outlined" onClick={() => { if (window.confirm('Have you read and do you agree to the Minecraft EULA?')) void acceptEula(server.id).catch((error: unknown) => setError(String(error))) }}>Accept EULA</Button>
        </Stack>
      </Paper>}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 600 }}>Startup</Typography>
          <Box sx={columns}>
            {field('javaVersion', 'Java version', { select: true, children: javaVersions.map((version) => <MenuItem key={version} value={version}>{version}</MenuItem>) })}
            {field('jarFile', 'JAR file')}
            {field('minMemory', 'Initial memory (MiB)', { type: 'number', slotProps: { htmlInput: { min: 128, step: 1 } } })}
            {field('maxMemory', 'Maximum memory (MiB)', { type: 'number', slotProps: { htmlInput: { min: 128, step: 1 } } })}
          </Box>
          {field('startupCommand', 'Startup command', { multiline: true, minRows: 2, sx: { '& textarea': { fontFamily: 'monospace', fontSize: 13 } }, helperText: '{{MIN_MEMORY}}, {{MAX_MEMORY}} and {{JAR_FILE}} use the values above.' })}
          {field('stopCommand', 'Stop command')}
        </Stack>
      </Paper>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={1}>
          <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 600 }}>Automation</Typography>
          <FormControlLabel control={<Switch checked={values.restartOnCrash} onChange={(event) => change('restartOnCrash', event.target.checked)} />} label="Restart after a crash" />
        </Stack>
      </Paper>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Button type="submit" variant="contained">Save changes</Button>
        {error && <Typography variant="body2" color="error" role="alert">{error}</Typography>}
        {saved && <Typography variant="body2" color="text.secondary" role="status">Saved.</Typography>}
      </Stack>
    </Stack>
  )
}

export default function ServerSettings({ server }: ServerProps) {
  return <SettingsForm key={server.id} server={server} />
}
