import { useEffect, useState } from 'react'
import { Alert, Button, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material'
import { usePanel } from '../data/usePanel'
import type { PluginProject, PluginRelease, ServerProps } from '../types'
import { reportedMinecraftVersion, reportedProxyVersion } from '../minecraft-version'

export default function ServerPlugins({ server }: ServerProps) {
  const { plugins, searchPlugins, pluginVersions, installPlugin, removePlugin } = usePanel()
  const [source, setSource] = useState<PluginProject['source']>('hangar')
  const [query, setQuery] = useState('')
  const proxy = server.kind === 'velocity'
  const needsVersion = !proxy || source === 'hangar'
  const liveVersion = proxy ? reportedProxyVersion(server.telemetry) : reportedMinecraftVersion(server.telemetry)
  const cachedVersion = proxy ? server.proxyVersion : server.minecraftVersion
  const [manualGame, setManualGame] = useState<string>()
  const game = needsVersion ? liveVersion ?? manualGame ?? cachedVersion ?? '' : ''
  const [results, setResults] = useState<PluginProject[]>([])
  const [browse, setBrowse] = useState({ query: '' })
  const [catalogPending, setCatalogPending] = useState(true)
  const [catalogError, setCatalogError] = useState('')
  const [project, setProject] = useState<PluginProject>()
  const [versionSet, setVersionSet] = useState<{ game: string; releases: PluginRelease[] }>({ game: '', releases: [] })
  const versions = versionSet.game === game ? versionSet.releases : []
  const [selected, setSelected] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let current = true
    void searchPlugins(server.id, source, browse.query).then((projects) => {
      if (current) { setResults(projects); setCatalogError(''); setCatalogPending(false) }
    }).catch((error: unknown) => {
      if (current) { setCatalogError(String(error)); setCatalogPending(false) }
    })
    return () => { current = false }
  }, [server.id, source, browse, searchPlugins])
  async function run(operation: () => Promise<void>) { setBusy(true); setError(''); try { await operation() } catch (error) { setError(String(error)) } finally { setBusy(false) } }
  const release = versions.find((v) => v.id === selected)
  async function choose(p: PluginProject) {
    setProject(p); setSelected(''); setVersionSet({ game, releases: [] })
    const releases = await pluginVersions(server.id, p.source, p.id, game)
    setVersionSet({ game, releases }); setSelected(releases[0]?.id ?? '')
  }
  return <Stack spacing={2}>
    <Typography variant="body2" color="text.secondary">{proxy ? 'Velocity proxy plugins' : 'Paper backend plugins'}</Typography>
    <Alert severity="info">Install trusted plugins only: plugins execute Java code. Changes apply on the next server restart; no hot loading. Required dependencies are listed but not installed automatically.</Alert>
    <Stack component="form" direction={{ xs: 'column', sm: 'row' }} spacing={1} onSubmit={(event) => {
      event.preventDefault(); setCatalogPending(true); setCatalogError(''); setError(''); setResults([]); setProject(undefined); setBrowse({ query: query.trim() })
    }}>
      <TextField select label="Catalog" value={source} disabled={busy} onChange={(e) => { setSource(e.target.value as PluginProject['source']); setResults([]); setProject(undefined); setCatalogPending(true); setCatalogError(''); setBrowse({ query: query.trim() }) }} sx={{ minWidth: 140 }}><MenuItem value="hangar">Hangar</MenuItem><MenuItem value="modrinth">Modrinth</MenuItem></TextField>
      {needsVersion && <TextField label={proxy ? 'Velocity version' : 'Minecraft version'} value={game} disabled={busy || Boolean(liveVersion)} onChange={(e) => setManualGame(e.target.value)} placeholder={proxy ? '3.4.0' : '1.21.11'} helperText={liveVersion ? 'Detected by agent' : cachedVersion && manualGame === undefined ? 'Last detected; start server to refresh' : 'Start server to detect automatically'} />}
      <TextField label="Search plugins" value={query} disabled={busy} onChange={(e) => setQuery(e.target.value)} />
      <Button type="submit" disabled={busy}>{query.trim() ? 'Search' : 'Popular'}</Button>
    </Stack>
    {error && <Alert severity="error">{error}</Alert>}
    {catalogError && <Alert severity="error">{catalogError}</Alert>}
    <Typography variant="subtitle2">{browse.query ? 'Search results' : 'Popular plugins'}</Typography>
    {catalogPending && <Typography color="text.secondary" role="status">Loading plugins…</Typography>}
    {!catalogPending && !catalogError && results.length === 0 && <Typography color="text.secondary">No plugins found.</Typography>}
    {results.map((p) => <Paper key={p.id} variant="outlined" sx={{ p: 2 }}><Stack direction="row" spacing={2}><Stack sx={{ flex: 1 }}><Typography>{p.name}</Typography><Typography variant="caption" color="text.secondary">{p.description}</Typography></Stack><Button disabled={busy} onClick={() => void run(() => choose(p))}>Versions</Button></Stack></Paper>)}
    {project && <Paper variant="outlined" sx={{ p: 2 }}><Stack spacing={2}>
      <Typography>{project.name}</Typography>
      {!versions.length ? <Typography color="text.secondary">No stable {proxy ? 'Velocity' : 'Paper'} releases{needsVersion ? ' for this version' : ''}.</Typography> : <>
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
