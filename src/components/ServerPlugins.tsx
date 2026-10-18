import { useState } from 'react'
import { Alert, Button, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material'
import { usePanel } from '../data/usePanel'
import type { PluginProject, PluginRelease, ServerProps } from '../types'
import { reportedMinecraftVersion } from '../minecraft-version'

export default function ServerPlugins({ server }: ServerProps) {
  const { plugins, searchPlugins, pluginVersions, installPlugin, removePlugin } = usePanel()
  const [source, setSource] = useState<PluginProject['source']>('modrinth')
  const [query, setQuery] = useState('')
  const liveVersion = reportedMinecraftVersion(server.telemetry)
  const [manualGame, setManualGame] = useState<string>()
  const game = liveVersion ?? manualGame ?? server.minecraftVersion ?? ''
  const [results, setResults] = useState<PluginProject[]>([])
  const [project, setProject] = useState<PluginProject>()
  const [versionSet, setVersionSet] = useState<{ game: string; releases: PluginRelease[] }>({ game: '', releases: [] })
  const versions = versionSet.game === game ? versionSet.releases : []
  const [selected, setSelected] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function run(operation: () => Promise<void>) { setBusy(true); setError(''); try { await operation() } catch (error) { setError(String(error)) } finally { setBusy(false) } }
  const release = versions.find((v) => v.id === selected)
  async function choose(p: PluginProject) {
    setProject(p); setSelected(''); setVersionSet({ game, releases: [] })
    const releases = await pluginVersions(server.id, p.source, p.id, game)
    setVersionSet({ game, releases }); setSelected(releases[0]?.id ?? '')
  }
  return <Stack spacing={2}>
    <Alert severity="info">Install trusted plugins only: plugins execute Java code. Changes apply on the next server restart; no hot loading. Required dependencies are listed but not installed automatically.</Alert>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
      <TextField select label="Catalog" value={source} disabled={busy} onChange={(e) => { setSource(e.target.value as PluginProject['source']); setResults([]); setProject(undefined) }} sx={{ minWidth: 140 }}><MenuItem value="modrinth">Modrinth</MenuItem><MenuItem value="hangar">Hangar</MenuItem></TextField>
      <TextField label="Minecraft version" value={game} disabled={busy || Boolean(liveVersion)} onChange={(e) => setManualGame(e.target.value)} placeholder="1.21.11" helperText={liveVersion ? 'Detected by agent' : server.minecraftVersion && manualGame === undefined ? 'Last detected; start server to refresh' : 'Start server to detect automatically'} />
      <TextField label="Search plugins" value={query} disabled={busy} onChange={(e) => setQuery(e.target.value)} />
      <Button disabled={busy} onClick={() => void run(async () => { setResults(await searchPlugins(server.id, source, query)); setProject(undefined) })}>Search</Button>
    </Stack>
    {error && <Alert severity="error">{error}</Alert>}
    {results.map((p) => <Paper key={p.id} variant="outlined" sx={{ p: 2 }}><Stack direction="row" spacing={2}><Stack sx={{ flex: 1 }}><Typography>{p.name}</Typography><Typography variant="caption" color="text.secondary">{p.description}</Typography></Stack><Button disabled={busy} onClick={() => void run(() => choose(p))}>Versions</Button></Stack></Paper>)}
    {project && <Paper variant="outlined" sx={{ p: 2 }}><Stack spacing={2}>
      <Typography>{project.name}</Typography>
      {!versions.length ? <Typography color="text.secondary">No stable Paper releases for this Minecraft version.</Typography> : <>
        <TextField select label="Compatible release" value={selected} disabled={busy} onChange={(e) => setSelected(e.target.value)}>{versions.map((v) => <MenuItem key={v.id} value={v.id}>{v.name}</MenuItem>)}</TextField>
        {release?.dependencies.length ? <Alert severity="warning">Required dependencies: {release.dependencies.join(', ')}. Install these separately.</Alert> : null}
        <Button disabled={busy || !selected} onClick={() => { if (window.confirm('Install this plugin release? It runs with full server permissions after restart.')) void run(async () => { await installPlugin(server.id, project.source, project.id, selected, game); setProject(undefined) }) }}>Install / update</Button>
      </>}
    </Stack></Paper>}
    <Typography variant="subtitle2">Panel-managed plugins</Typography>
    {(plugins[server.id] ?? []).map((p) => <Paper key={`${p.source}:${p.project}`} variant="outlined" sx={{ p: 2 }}><Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}><Typography sx={{ flex: 1 }} variant="body2">{p.name} · {p.version} · {p.source}</Typography><Button disabled={busy} onClick={() => void run(() => choose({ source: p.source, id: p.project, name: p.name, description: '' }))}>Check updates</Button><Button color="error" disabled={busy} onClick={() => { if (window.confirm('Remove the plugin JAR? Its configuration is kept; restart to unload it.')) void run(() => removePlugin(server.id, p.source, p.project)) }}>Remove</Button></Stack></Paper>)}
    <Typography variant="caption" color="text.secondary">Manually uploaded plugins remain accessible in Files.</Typography>
  </Stack>
}
