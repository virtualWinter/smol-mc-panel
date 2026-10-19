import { useState } from 'react'
import { Accordion, AccordionDetails, AccordionSummary, Box, Button, FormControlLabel, MenuItem, Paper, Stack, Switch, TextField, Typography } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { usePanel } from '../data/usePanel'
import type { ServerProps, Server } from '../types'
import type { TextFieldProps } from '@mui/material'
import DownloadProgress from './DownloadProgress'

function SettingsForm({ server }: ServerProps) {
  const { saveSettings, acceptEula, reinstallServer, javaVersions } = usePanel()
  const [values, setValues] = useState(server)
  const [previousJava, setPreviousJava] = useState(server.javaVersion)
  if (previousJava !== server.javaVersion) {
    setPreviousJava(server.javaVersion)
    setValues((current) => ({ ...current, javaVersion: server.javaVersion }))
  }
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const locked = server.status !== 'Offline'
  const [error, setError] = useState('')
  const [reinstalling, setReinstalling] = useState(false)
  const downloadActive = server.download && !['complete', 'failed'].includes(server.download.phase)
  const change = (field: keyof Server, value: string | boolean) => {
    setValues((current) => ({ ...current, [field]: value }))
    setSaved(false)
    setError('')
  }
  const field = (name: keyof Server, label: string, extra: TextFieldProps = {}) => (
    <TextField required fullWidth size="small" disabled={saving || locked} label={label} value={values[name]} onChange={(event) => change(name, event.target.value)} {...extra} />
  )
  const columns = { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }

  return (
    <Stack component="form" spacing={2} onSubmit={async (event) => {
      event.preventDefault()
      if (Number(values.minMemory) > Number(values.maxMemory)) {
        setError('Initial memory cannot exceed maximum memory.')
        return
      }
      if (saving || locked) return
      setSaving(true); setError(''); setSaved(false)
      try { await saveSettings(server.id, {
        ...values,
        name: values.name.trim(), address: values.address.trim(),
        minMemory: Number(values.minMemory), maxMemory: Number(values.maxMemory),
      })
      setSaved(true) } catch (error) { setError(String(error)) } finally { setSaving(false) }
    }}>
      {locked && <Typography variant="caption" color="text.secondary">Stop the server to edit settings.</Typography>}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Typography component="h2" variant="subtitle2">General</Typography>
          <Box sx={columns}>
            {field('name', 'Name')}
            {field('address', 'Address', { slotProps: { input: { readOnly: true } } })}
          </Box>
          {server.kind !== 'velocity' && field('group', 'Group (folder)')}
        </Stack>
      </Paper>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={1.5} sx={{ alignItems: 'flex-start' }}>
          <Typography component="h2" variant="subtitle2">Server software</Typography>
          <Typography variant="body2" color="text.secondary">{server.jarVersion ?? (server.installed ? server.jarFile : 'Not installed')}</Typography>
          <Button type="button" variant="outlined" disabled={saving || reinstalling || downloadActive || server.status !== 'Offline'} onClick={async () => {
            const version = server.jarVersion ?? 'the latest stable release (this may change the Minecraft version and Java requirements; back up your worlds first)'
            if (!window.confirm(`Download ${version} and replace ${server.jarFile}? Other server files will not be deleted.`)) return
            setReinstalling(true); setError('')
            try { await reinstallServer(server.id) }
            catch (error) { setError(String(error)) }
            finally { setReinstalling(false) }
          }}>{reinstalling || downloadActive ? 'Installing…' : server.installed ? 'Reinstall' : 'Install'}</Button>
          {((server.download && !server.download.label?.startsWith('Java')) || reinstalling) && <DownloadProgress progress={reinstalling && !downloadActive ? { phase: 'resolving', received: 0, total: 0, bytesPerSecond: 0 } : server.download ?? { phase: 'resolving', received: 0, total: 0, bytesPerSecond: 0 }} />}
        </Stack>
      </Paper>
      {server.kind === 'paper' && !server.eulaAccepted && <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={1.5} sx={{ alignItems: 'flex-start' }}>
          <Typography component="h2" variant="subtitle2">Minecraft EULA</Typography>
          <Typography variant="body2" color="text.secondary">Required before the server can start.</Typography>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}><Button variant="outlined" disabled={locked || saving} onClick={() => { if (window.confirm('Have you read and do you agree to the Minecraft EULA?')) void acceptEula(server.id).catch((error: unknown) => setError(String(error))) }}>Accept EULA</Button><Button href="https://aka.ms/MinecraftEULA" target="_blank" rel="noopener noreferrer" sx={{ color: 'text.secondary' }}>Read</Button></Stack>
        </Stack>
      </Paper>}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Typography component="h2" variant="subtitle2">Runtime</Typography>
          {field('javaVersion', 'Java', { select: true, children: javaVersions.map((version) => <MenuItem key={version} value={version}>{version}</MenuItem>) })}
          <Box sx={columns}>
            {field('minMemory', 'Initial memory (MiB)', { type: 'number', slotProps: { htmlInput: { min: 128, step: 1 } } })}
            {field('maxMemory', 'Maximum memory (MiB)', { type: 'number', slotProps: { htmlInput: { min: 128, step: 1 } } })}
          </Box>
          <FormControlLabel control={<Switch disabled={locked || saving} checked={values.restartOnCrash} onChange={(event) => change('restartOnCrash', event.target.checked)} />} label="Restart after a crash" />
        </Stack>
      </Paper>
      <Accordion variant="outlined" disableGutters sx={{ '&:before': { display: 'none' } }}><AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography variant="body2">Advanced</Typography></AccordionSummary><AccordionDetails><Stack spacing={2}>
        {field('jarFile', 'JAR file')}
        {field('workingDirectory', 'Directory', { slotProps: { input: { readOnly: true } } })}
        {field('startupCommand', 'Startup command', { multiline: true, minRows: 2, sx: { '& textarea': { fontFamily: 'monospace', fontSize: 13 } }, helperText: '{{MIN_MEMORY}} · {{MAX_MEMORY}} · {{JAR_FILE}}' })}
        {field('stopCommand', 'Stop command')}
      </Stack></AccordionDetails></Accordion>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Button type="submit" variant="contained" disabled={saving || locked}>{saving ? 'Saving…' : 'Save changes'}</Button>
        {error && <Typography variant="body2" color="error" role="alert">{error}</Typography>}
        {saved && <Typography variant="body2" color="text.secondary" role="status">Saved</Typography>}
      </Stack>
    </Stack>
  )
}

export default function ServerSettings({ server }: ServerProps) {
  return <SettingsForm key={server.id} server={server} />
}
