import { useState } from 'react'
import { Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, IconButton, InputLabel, ListItemText, MenuItem, OutlinedInput, Select, Stack, Tab, Tabs, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import AddIcon from '@mui/icons-material/Add'
import { usePanel } from '../data/usePanel'

interface NodeRow { node: string; value: boolean }
interface GroupDraft { name: string; weight: number; inherits: string[]; isNew: boolean; nodes: NodeRow[] }
interface UserDraft { uuid: string; name: string; groups: string[]; nodes: NodeRow[] }

export default function NetworkPermissions() {
  const { servers, permissions, savePermissionGroup, removePermissionGroup, setDefaultPermissionGroup, savePermissionUser, removePermissionUser, trackPermissionUser } = usePanel()
  const [open, setOpen] = useState(false), [tab, setTab] = useState('groups')
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [group, setGroup] = useState<GroupDraft | null>(null), [user, setUser] = useState<UserDraft | null>(null)
  const [selectedUser, setSelectedUser] = useState(''), [newPlayer, setNewPlayer] = useState('')

  const groups = permissions.groups.map((entry) => entry.name)
  const pending = servers.some((server) => server.permissionPlugin === 'pending')

  async function run(operation: () => Promise<unknown>, message: string) {
    setBusy(true); setError(''); setNotice('')
    try { await operation(); setNotice(message) } catch (error) { setError(String(error)) } finally { setBusy(false) }
  }

  function editGroup(name: string) {
    setNotice(''); setError('')
    if (name === '__new') { setGroup({ name: '', weight: 0, inherits: [], isNew: true, nodes: [] }); return }
    const found = permissions.groups.find((entry) => entry.name === name)
    if (found) setGroup({ name: found.name, weight: found.weight, inherits: [...found.inherits], isNew: false, nodes: Object.entries(found.permissions).map(([node, value]) => ({ node, value })) })
  }

  function editUser(uuid: string) {
    setNotice(''); setError(''); setSelectedUser(uuid)
    const found = permissions.users.find((entry) => entry.uuid === uuid)
    if (found) setUser({ uuid: found.uuid, name: found.name, groups: [...found.groups], nodes: Object.entries(found.permissions).map(([node, value]) => ({ node, value })) })
    else setUser(null)
  }

  const nodes = (rows: NodeRow[]) => rows.map((row) => ({ node: row.node.trim(), value: row.value })).filter((row) => row.node)

  return <>
    <Button size="small" onClick={() => { setOpen(true); setError(''); setNotice(''); if (!group && groups.length) editGroup(groups[0]) }}>Permissions</Button>
    <Dialog open={open} fullWidth maxWidth="md" onClose={() => { if (!busy) setOpen(false) }}>
      <DialogTitle>Permissions</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Tabs value={tab} onChange={(_, value: string) => { setTab(value); setError(''); setNotice('') }} aria-label="Permissions"><Tab label="Groups" value="groups" disabled={busy} /><Tab label="Players" value="players" disabled={busy} /></Tabs>
          <Typography variant="caption" color="text.secondary">
            Applied network-wide. Groups decide which nodes a player has; direct player entries beat every group, and a heavier group beats a lighter one. Wildcards like <code>*</code> and <code>essentials.*</code> are supported.
          </Typography>
          {pending && <Alert severity="info">The permission plugin installs the next time each server starts. Restart a running server to enforce changes on it.</Alert>}
          {error && <Alert severity="error">{error}</Alert>}
          {notice && <Typography variant="body2" color="text.secondary" role="status">{notice}</Typography>}

          {tab === 'groups' ? <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
              <TextField select label="Group" disabled={busy} value={group?.isNew ? '__new' : group?.name ?? ''} onChange={(e) => editGroup(e.target.value)} sx={{ minWidth: 200 }}>
                {groups.map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
                <MenuItem value="__new">New group…</MenuItem>
              </TextField>
              {group && !group.isNew && group.name === permissions.defaultGroup && <Chip size="small" variant="outlined" label="Default" />}
              {group && !group.isNew && group.name !== permissions.defaultGroup && <Button disabled={busy} onClick={() => void run(() => setDefaultPermissionGroup(group.name), `${group.name} is now the default group`)}>Make default</Button>}
            </Stack>
            {group ? <Stack component="form" id="permission-group" spacing={2} onSubmit={(e) => { e.preventDefault(); const name = group.name.trim().toLowerCase(); void run(async () => { await savePermissionGroup({ name, weight: group.weight, inherits: group.inherits, permissions: nodes(group.nodes) }); setGroup({ ...group, name, isNew: false }) }, 'Group saved') }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                <TextField required label="Name" disabled={busy || !group.isNew} value={group.name} onChange={(e) => setGroup({ ...group, name: e.target.value })} slotProps={{ htmlInput: { pattern: '[a-z][a-z0-9_\\-]{0,31}', maxLength: 32 } }} />
                <TextField label="Weight" disabled={busy} type="number" value={group.weight} onChange={(e) => setGroup({ ...group, weight: Number(e.target.value) })} slotProps={{ htmlInput: { min: -1000, max: 1000 } }} />
              </Box>
              <FormControl disabled={busy}>
                <InputLabel id="inherit-label">Inherits</InputLabel>
                <Select multiple labelId="inherit-label" label="Inherits" value={group.inherits} onChange={(e) => setGroup({ ...group, inherits: typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value })}
                  input={<OutlinedInput label="Inherits" />} renderValue={(selected: string[]) => selected.length ? selected.join(', ') : '—'}>
                  {groups.filter((name) => name !== group.name).map((name) => <MenuItem key={name} value={name}><Checkbox size="small" checked={group.inherits.includes(name)} /><ListItemText primary={name} /></MenuItem>)}
                </Select>
              </FormControl>
              <Nodes rows={group.nodes} disabled={busy} onChange={(rows) => setGroup({ ...group, nodes: rows })} />
            </Stack> : <Typography variant="body2" color="text.secondary">Create a group to start assigning permissions.</Typography>}
          </Stack> : <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
              <TextField select label="Player" disabled={busy} value={selectedUser} onChange={(e) => editUser(e.target.value)} sx={{ minWidth: 200 }}>
                {permissions.users.map((entry) => <MenuItem key={entry.uuid} value={entry.uuid}>{entry.name || entry.uuid}</MenuItem>)}
              </TextField>
              <Stack component="form" direction="row" spacing={1} onSubmit={(e) => { e.preventDefault(); const name = newPlayer; void run(async () => { const player = await trackPermissionUser(name); setNewPlayer(''); setSelectedUser(player.uuid); setUser({ uuid: player.uuid, name: player.name, groups: [], nodes: [] }) }, 'Player added') }}>
                <TextField required label="Add player" disabled={busy} value={newPlayer} onChange={(e) => setNewPlayer(e.target.value)} slotProps={{ htmlInput: { pattern: '[a-zA-Z0-9_]{1,16}', maxLength: 16 } }} />
                <Button type="submit" disabled={busy || !newPlayer}>Add</Button>
              </Stack>
            </Stack>
            {user ? <Stack component="form" id="permission-user" spacing={2} onSubmit={(e) => { e.preventDefault(); void run(() => savePermissionUser({ uuid: user.uuid, name: user.name, groups: user.groups, permissions: nodes(user.nodes) }), 'Player saved') }}>
              <Box><Typography variant="subtitle2">{user.name || 'Player'}</Typography><Typography variant="caption" color="text.secondary">{user.uuid}</Typography></Box>
              <FormControl disabled={busy}>
                <InputLabel id="user-group-label">Groups</InputLabel>
                <Select multiple labelId="user-group-label" label="Groups" value={user.groups} onChange={(e) => setUser({ ...user, groups: typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value })}
                  input={<OutlinedInput label="Groups" />} renderValue={(selected: string[]) => selected.length ? selected.join(', ') : '—'}>
                  {groups.map((name) => <MenuItem key={name} value={name}><Checkbox size="small" checked={user.groups.includes(name)} /><ListItemText primary={name} /></MenuItem>)}
                </Select>
              </FormControl>
              <Nodes rows={user.nodes} disabled={busy} onChange={(rows) => setUser({ ...user, nodes: rows })} />
            </Stack> : <Typography variant="body2" color="text.secondary">Players without a group entry simply get the default group.</Typography>}
          </Stack>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={() => setOpen(false)}>Close</Button>
        {tab === 'groups' && group && !group.isNew && group.name !== permissions.defaultGroup && <Button color="error" disabled={busy} onClick={() => { if (window.confirm(`Delete the ${group.name} group?`)) void run(async () => { await removePermissionGroup(group.name); setGroup(null) }, 'Group deleted') }}>Delete</Button>}
        {tab === 'groups' && group && <Button variant="contained" type="submit" form="permission-group" disabled={busy || !group.name}>{busy ? 'Saving…' : 'Save group'}</Button>}
        {tab === 'players' && user && <Button color="error" disabled={busy} onClick={() => { if (window.confirm(`Remove ${user.name || user.uuid} from permissions?`)) void run(async () => { await removePermissionUser(user.uuid); setUser(null); setSelectedUser('') }, 'Player removed') }}>Remove</Button>}
        {tab === 'players' && user && <Button variant="contained" type="submit" form="permission-user" disabled={busy}>{busy ? 'Saving…' : 'Save player'}</Button>}
      </DialogActions>
    </Dialog>
  </>
}

function Nodes({ rows, disabled, onChange }: { rows: NodeRow[]; disabled: boolean; onChange: (rows: NodeRow[]) => void }) {
  return <Stack spacing={1}>
    <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}><Typography variant="subtitle2">Permissions</Typography><Chip size="small" variant="outlined" label={`${rows.length}`} /></Stack>
    {rows.map((row, index) => <Stack key={index} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <TextField disabled={disabled} value={row.node} placeholder="essentials.fly" onChange={(e) => onChange(rows.map((entry, position) => position === index ? { ...entry, node: e.target.value } : entry))} sx={{ flex: 1 }} slotProps={{ htmlInput: { maxLength: 128, spellCheck: false } }} />
      <ToggleButtonGroup exclusive size="small" disabled={disabled} value={row.value ? 'allow' : 'deny'} onChange={(_, value: string | null) => { if (value) onChange(rows.map((entry, position) => position === index ? { ...entry, value: value === 'allow' } : entry)) }}>
        <ToggleButton value="allow">Allow</ToggleButton><ToggleButton value="deny">Deny</ToggleButton>
      </ToggleButtonGroup>
      <IconButton size="small" disabled={disabled} aria-label="Remove permission" onClick={() => onChange(rows.filter((_, position) => position !== index))}><DeleteIcon fontSize="small" /></IconButton>
    </Stack>)}
    <Box><Button startIcon={<AddIcon />} disabled={disabled} onClick={() => onChange([...rows, { node: '', value: true }])}>Add permission</Button></Box>
  </Stack>
}
