import { useEffect, useState } from 'react'
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material'
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
  const managed = plugins[server.id] ?? []
  const installed = managed.find((p) => p.source === project?.source && p.project === project?.id)
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
    const targetGame = proxy && p.source === 'modrinth' ? '' : liveVersion ?? manualGame ?? cachedVersion ?? ''
    if (p.source !== source) { setSource(p.source); setResults([]); setCatalogPending(true) }
    setProject(p); setSelected(''); setVersionSet({ game: targetGame, releases: [] })
    const releases = await pluginVersions(server.id, p.source, p.id, targetGame)
    setVersionSet({ game: targetGame, releases }); setSelected(releases[0]?.id ?? '')
  }
  return <Stack spacing={2.5}>
    {error && !project && <Alert severity="error">{error}</Alert>}
    {managed.length > 0 && <Stack spacing={1}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap' }}><Typography variant="subtitle2">Installed</Typography><Typography variant="caption" color="text.secondary">Restart to apply changes</Typography></Stack>
      <Paper variant="outlined"><Stack divider={<Divider />}>
        {managed.map((p) => <Stack key={`${p.source}:${p.project}`} direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ p: 1.5, alignItems: { sm: 'center' } }}>
          <Box sx={{ flex: 1, minWidth: 0 }}><Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{p.name.split('/').pop()}</Typography><Typography variant="caption" color="text.secondary">{p.version} · {p.source}</Typography></Box>
          <Stack direction="row" spacing={1}><Button disabled={busy} onClick={() => void run(() => choose({ source: p.source, id: p.project, name: p.name, description: '' }))}>Update</Button><Button color="error" disabled={busy} onClick={() => { if (window.confirm(`Remove ${p.name}? Config files are kept. Restart to unload it.`)) void run(() => removePlugin(server.id, p.source, p.project)) }}>Remove</Button></Stack>
        </Stack>)}
      </Stack></Paper>
    </Stack>}
    <Stack component="form" direction={{ xs: 'column', md: 'row' }} spacing={1} onSubmit={(event) => {
      event.preventDefault(); setCatalogPending(true); setCatalogError(''); setError(''); setResults([]); setBrowse({ query: query.trim() })
    }}>
      <TextField select label="Catalog" value={source} disabled={busy} onChange={(e) => { setSource(e.target.value as PluginProject['source']); setResults([]); setProject(undefined); setCatalogPending(true); setCatalogError(''); setBrowse({ query: query.trim() }) }} sx={{ minWidth: 140 }}><MenuItem value="hangar">Hangar</MenuItem><MenuItem value="modrinth">Modrinth</MenuItem></TextField>
      {needsVersion && <TextField label={proxy ? 'Velocity' : 'Minecraft'} value={game} disabled={busy || Boolean(liveVersion)} onChange={(e) => setManualGame(e.target.value)} placeholder={proxy ? '3.4.0' : '1.21.11'} helperText={liveVersion ? undefined : cachedVersion && manualGame === undefined ? 'Last run' : 'Start server to detect'} slotProps={{ inputLabel: { shrink: true } }} sx={{ minWidth: 120, maxWidth: { md: 190 } }} />}
      <TextField label="Search plugins" value={query} disabled={busy} onChange={(e) => setQuery(e.target.value)} sx={{ flex: 1 }} />
      <Button type="submit" disabled={busy} sx={{ alignSelf: { md: 'flex-start' }, minHeight: 40 }}>{query.trim() ? 'Search' : 'Browse'}</Button>
    </Stack>
    {catalogError && <Alert severity="error">{catalogError}</Alert>}
    <Stack spacing={1}>
      <Typography variant="subtitle2">{browse.query ? 'Results' : 'Popular'}</Typography>
      {catalogPending ? <Typography variant="body2" color="text.secondary" role="status">Loading…</Typography> : !catalogError && results.length === 0 ? <Typography variant="body2" color="text.secondary">No plugins found.</Typography> : null}
      {results.length > 0 && <Paper variant="outlined"><Stack divider={<Divider />}>
        {results.map((p) => <Stack key={p.id} direction="row" spacing={2} sx={{ p: 1.5, alignItems: 'center' }}><Box sx={{ flex: 1, minWidth: 0 }}><Typography variant="body2" sx={{ fontWeight: 500 }}>{p.name}</Typography><Typography variant="caption" color="text.secondary" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.description}</Typography></Box><Button disabled={busy} onClick={() => void run(() => choose(p))}>Versions</Button></Stack>)}
      </Stack></Paper>}
    </Stack>
    <Dialog open={Boolean(project)} onClose={() => { if (!busy) setProject(undefined) }} fullWidth maxWidth="sm">
      <DialogTitle>{project?.name}</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        {error && <Alert severity="error">{error}</Alert>}
        {busy && !versions.length ? <Typography role="status">Loading versions…</Typography> : !versions.length ? !error && <Typography color="text.secondary">No compatible stable releases.</Typography> : <>
          <TextField select label="Version" value={selected} disabled={busy} onChange={(e) => setSelected(e.target.value)}>{versions.map((v) => <MenuItem key={v.id} value={v.id}>{v.name}</MenuItem>)}</TextField>
          {release?.dependencies.length ? <Alert severity="warning">Install dependencies separately: {release.dependencies.join(', ')}</Alert> : null}
          <Typography variant="caption" color="text.secondary">Restart required. Only install plugins you trust.</Typography>
        </>}
      </Stack></DialogContent>
      <DialogActions><Button disabled={busy} onClick={() => setProject(undefined)}>Cancel</Button><Button variant="contained" disabled={busy || !selected || !versions.length || selected === installed?.version} onClick={() => { if (project) void run(async () => { await installPlugin(server.id, project.source, project.id, selected, game); setProject(undefined) }) }}>{busy ? 'Installing…' : installed ? 'Update' : 'Install'}</Button></DialogActions>
    </Dialog>
  </Stack>
}
