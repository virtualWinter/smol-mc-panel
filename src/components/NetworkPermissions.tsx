import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Alert, Autocomplete, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogContent,
  Divider, IconButton, InputAdornment, List, ListItemButton, Paper, Stack, Tab, Tabs, TextField, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import BlockIcon from '@mui/icons-material/Block'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import DeleteIcon from '@mui/icons-material/Delete'
import PersonAddAltIcon from '@mui/icons-material/PersonAddAlt'
import SearchIcon from '@mui/icons-material/Search'
import StarIcon from '@mui/icons-material/Star'
import StarBorderIcon from '@mui/icons-material/StarBorder'
import { usePanel } from '../data/usePanel'
import type { PermissionGroup, PermissionUser } from '../permission-model'

interface NodeRow { node: string; value: boolean }
interface GroupDraft { name: string; weight: string; inherits: string[]; isNew: boolean; nodes: NodeRow[] }
interface UserDraft { uuid: string; name: string; groups: string[]; nodes: NodeRow[] }
type Status = 'idle' | 'saving' | 'saved' | 'invalid' | 'error'

const groupPattern = /^[a-z][a-z0-9_-]{0,31}$/u
const nodePattern = /^[a-z0-9][a-z0-9.*_:-]{0,127}$/u
const palette = ['#ef9a9a', '#ffb74d', '#64b5f6', '#ce93d8', '#4db6ac', '#aed581', '#f48fb1', '#bcaaa4']

const rowsOf = (permissions: Record<string, boolean>): NodeRow[] =>
  Object.entries(permissions).map(([node, value]) => ({ node, value }))

const nodesOf = (rows: NodeRow[]) =>
  rows.map((row) => ({ node: row.node.trim(), value: row.value })).filter((row) => row.node)

const draftOfGroup = (group: PermissionGroup): GroupDraft => ({
  name: group.name, weight: String(group.weight), inherits: [...group.inherits], isNew: false, nodes: rowsOf(group.permissions),
})

const draftOfUser = (user: PermissionUser): UserDraft => ({
  uuid: user.uuid, name: user.name, groups: [...user.groups], nodes: rowsOf(user.permissions),
})

const categoryOf = (node: string) => {
  const part = node.split('.')[0]
  return part === '*' ? 'All' : part.charAt(0).toUpperCase() + part.slice(1)
}

const colorOf = (name: string) => {
  if (name === 'default') return '#9e9e9e'
  let hash = 0
  for (let index = 0; index < name.length; index++) hash = (hash * 31 + name.charCodeAt(index)) | 0
  return palette[Math.abs(hash) % palette.length]
}

export default function NetworkPermissions({ scope = 'network', inline = false }: { scope?: string; inline?: boolean }) {
  const {
    servers, permissions, permissionServers, permissionGroups, availablePermissions,
    savePermissionGroup, removePermissionGroup, setDefaultPermissionGroup,
    savePermissionUser, removePermissionUser, trackPermissionUser,
  } = usePanel()
  const store = scope === 'network' ? permissions : scope.startsWith('server:') ? (permissionServers?.[scope.slice(7)] ?? permissions) : scope.startsWith('group:') ? (permissionGroups?.[scope.slice(6)] ?? permissions) : permissions

  const availableNodes = useMemo(() => {
    const list = scope === 'network'
      ? Object.values(availablePermissions ?? {}).flat()
      : scope.startsWith('server:')
        ? (availablePermissions?.[scope.slice(7)] ?? [])
        : scope.startsWith('group:')
          ? servers.filter((server) => server.group?.trim() === scope.slice(6)).flatMap((server) => availablePermissions?.[server.id] ?? [])
          : []
    return [...new Set(list)].sort((a, b) => a.localeCompare(b))
  }, [scope, availablePermissions, servers])

  const sortedGroups = useMemo(() => [...store.groups].sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name)), [store.groups])
  const sortedUsers = useMemo(() => [...store.users].sort((a, b) => (a.name || a.uuid).localeCompare(b.name || b.uuid)), [store.users])

  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('groups')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [groupFilter, setGroupFilter] = useState('')
  const [playerFilter, setPlayerFilter] = useState('')
  const [newPlayer, setNewPlayer] = useState('')

  const [selectedGroup, setSelectedGroup] = useState<string | null>(sortedGroups[0]?.name ?? null)
  const [groupDraft, setGroupDraft] = useState<GroupDraft | null>(sortedGroups[0] ? draftOfGroup(sortedGroups[0]) : null)
  const [selectedUser, setSelectedUser] = useState('')
  const [userDraft, setUserDraft] = useState<UserDraft | null>(null)

  const groupTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const userTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const groupPending = useRef<(() => void) | null>(null)
  const userPending = useRef<(() => void) | null>(null)
  useEffect(() => () => {
    clearTimeout(groupTimer.current)
    clearTimeout(userTimer.current)
    groupPending.current?.()
    userPending.current?.()
  }, [])

  const titleId = useId()
  const pending = servers.some((server) => server.permissionPlugin === 'pending')
  const target = scope === 'network' ? 'network' : scope.startsWith('server:') ? scope.slice(7) : scope.startsWith('group:') ? scope.slice(6) : scope
  const title = `Permissions · ${target}`
  const subtitle = scope === 'network'
    ? 'Manage groups and permission nodes for this network.'
    : scope.startsWith('group:') ? 'Manage groups and permission nodes for this server group.' : 'Manage groups and permission nodes for this server.'

  const rows = tab === 'groups' ? (groupDraft?.nodes ?? []) : (userDraft?.nodes ?? [])
  const totalNodes = new Set([...availableNodes, ...rows.map((row) => row.node)]).size
  const enabledNodes = rows.filter((row) => row.value).length

  function flushGroup() {
    clearTimeout(groupTimer.current)
    const run = groupPending.current
    groupPending.current = null
    run?.()
  }

  function flushUser() {
    clearTimeout(userTimer.current)
    const run = userPending.current
    userPending.current = null
    run?.()
  }

  function scheduleGroupSave(next: GroupDraft) {
    clearTimeout(groupTimer.current)
    groupPending.current = null
    setError('')
    const name = next.name.trim().toLowerCase()
    if (!groupPattern.test(name)) { setStatus('invalid'); return }
    const weight = Number(next.weight)
    if (!Number.isInteger(weight) || Math.abs(weight) > 1000) { setStatus('invalid'); return }
    setStatus('saving')
    const save = () => {
      groupPending.current = null
      void savePermissionGroup(scope, { name, weight, inherits: next.inherits, permissions: nodesOf(next.nodes) })
        .then(() => {
          setStatus('saved')
          setSelectedGroup(name)
          setGroupDraft((current) => current && current.name.trim().toLowerCase() === name && current.isNew ? { ...current, name, isNew: false } : current)
        })
        .catch((failure) => { setStatus('error'); setError(String(failure)) })
    }
    groupPending.current = save
    groupTimer.current = setTimeout(save, 450)
  }

  function updateGroup(patch: Partial<GroupDraft>) {
    if (!groupDraft) return
    const next = { ...groupDraft, ...patch }
    setGroupDraft(next)
    scheduleGroupSave(next)
  }

  function setGroupNode(node: string, value: boolean | undefined) {
    if (!groupDraft) return
    const nodes = value === undefined ? groupDraft.nodes.filter((row) => row.node !== node) : [...groupDraft.nodes.filter((row) => row.node !== node), { node, value }]
    updateGroup({ nodes })
  }

  function scheduleUserSave(next: UserDraft) {
    clearTimeout(userTimer.current)
    userPending.current = null
    setError('')
    setStatus('saving')
    const save = () => {
      userPending.current = null
      void savePermissionUser(scope, { uuid: next.uuid, name: next.name, groups: next.groups, permissions: nodesOf(next.nodes) })
        .then(() => setStatus('saved'))
        .catch((failure) => { setStatus('error'); setError(String(failure)) })
    }
    userPending.current = save
    userTimer.current = setTimeout(save, 450)
  }

  function updateUser(patch: Partial<UserDraft>) {
    if (!userDraft) return
    const next = { ...userDraft, ...patch }
    setUserDraft(next)
    scheduleUserSave(next)
  }

  function setUserNode(node: string, value: boolean | undefined) {
    if (!userDraft) return
    const nodes = value === undefined ? userDraft.nodes.filter((row) => row.node !== node) : [...userDraft.nodes.filter((row) => row.node !== node), { node, value }]
    updateUser({ nodes })
  }

  function addNode(raw: string) {
    const node = raw.trim().toLowerCase()
    if (!nodePattern.test(node)) { setError('Permission nodes use lowercase letters, digits and . * _ : -'); return }
    setError('')
    if (tab === 'groups') setGroupNode(node, true)
    else setUserNode(node, true)
  }

  function selectGroup(name: string) {
    const found = store.groups.find((group) => group.name === name)
    if (!found) return
    flushGroup()
    setSelectedGroup(name)
    setGroupDraft(draftOfGroup(found))
    setStatus('idle')
    setError('')
  }

  function selectUser(uuid: string) {
    const found = store.users.find((user) => user.uuid === uuid)
    if (!found) return
    flushUser()
    setSelectedUser(uuid)
    setUserDraft(draftOfUser(found))
    setStatus('idle')
    setError('')
  }

  function changeTab(value: string) {
    if (value === tab) return
    if (value === 'players') flushGroup()
    else flushUser()
    setTab(value)
    setStatus('idle')
    setError('')
    if (value === 'players' && !userDraft && sortedUsers[0]) selectUser(sortedUsers[0].uuid)
  }

  function startNewGroup() {
    flushGroup()
    setTab('groups')
    setSelectedGroup(null)
    setGroupDraft({ name: '', weight: '0', inherits: [], isNew: true, nodes: [] })
    setStatus('idle')
    setError('')
  }

  async function makeDefault(name: string) {
    setBusy(true); setError('')
    try { await setDefaultPermissionGroup(scope, name); setStatus('saved') }
    catch (failure) { setError(String(failure)) }
    finally { setBusy(false) }
  }

  async function deleteGroup(name: string) {
    if (!window.confirm(`Delete the ${name} group?`)) return
    clearTimeout(groupTimer.current)
    groupPending.current = null
    setBusy(true); setError('')
    try {
      await removePermissionGroup(scope, name)
      const next = sortedGroups.find((group) => group.name !== name)
      setSelectedGroup(next?.name ?? null)
      setGroupDraft(next ? draftOfGroup(next) : null)
      setStatus('idle')
    } catch (failure) { setError(String(failure)) }
    finally { setBusy(false) }
  }

  async function deleteUser(uuid: string) {
    if (!window.confirm(`Remove ${userDraft?.name || uuid} from permissions?`)) return
    clearTimeout(userTimer.current)
    userPending.current = null
    setBusy(true); setError('')
    try {
      await removePermissionUser(scope, uuid)
      const next = store.users.find((user) => user.uuid !== uuid)
      setSelectedUser(next?.uuid ?? '')
      setUserDraft(next ? draftOfUser(next) : null)
      setStatus('idle')
    } catch (failure) { setError(String(failure)) }
    finally { setBusy(false) }
  }

  async function addPlayer() {
    const name = newPlayer.trim()
    if (!name) return
    flushUser()
    setBusy(true); setError('')
    try {
      const player = await trackPermissionUser(scope, name)
      setNewPlayer('')
      const existing = store.users.find((user) => user.uuid === player.uuid)
      setSelectedUser(player.uuid)
      setUserDraft(existing ? draftOfUser(existing) : { uuid: player.uuid, name: player.name, groups: [], nodes: [] })
      setStatus('idle')
    } catch (failure) { setError(String(failure)) }
    finally { setBusy(false) }
  }

  const filteredGroups = groupFilter.trim() ? sortedGroups.filter((group) => group.name.includes(groupFilter.trim().toLowerCase())) : sortedGroups
  const filteredUsers = playerFilter.trim() ? sortedUsers.filter((user) => `${user.name} ${user.uuid}`.toLowerCase().includes(playerFilter.trim().toLowerCase())) : sortedUsers

  const sidebar = (
    <Paper variant="outlined" sx={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
      <Stack direction="row" spacing={1} sx={{ px: 1.5, pt: 1, alignItems: 'center' }}>
        <Typography variant="overline" color="text.secondary" sx={{ flex: 1, letterSpacing: '0.08em', lineHeight: 1.6 }}>{tab === 'groups' ? 'Groups' : 'Players'}</Typography>
        <Typography variant="caption" color="text.secondary">{tab === 'groups' ? sortedGroups.length : sortedUsers.length}</Typography>
      </Stack>
      <Box sx={{ px: 1.5, py: 1 }}>
        <TextField
          fullWidth
          placeholder={tab === 'groups' ? 'Filter groups' : 'Filter players'}
          value={tab === 'groups' ? groupFilter : playerFilter}
          onChange={(event) => { if (tab === 'groups') setGroupFilter(event.target.value); else setPlayerFilter(event.target.value) }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
        />
      </Box>
      <Divider />
      {tab === 'groups' ? (
        <List dense disablePadding sx={{ overflowY: 'auto', maxHeight: { xs: 260, md: 440 } }}>
          {filteredGroups.map((group) => {
            const selected = group.name === selectedGroup
            return (
              <ListItemButton key={group.name} selected={selected} onClick={() => selectGroup(group.name)} sx={{ borderLeft: 2, borderColor: selected ? 'primary.main' : 'transparent', py: 0.75, gap: 1 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: colorOf(group.name), flexShrink: 0 }} />
                <Typography variant="body2" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.name}</Typography>
                {group.name === store.defaultGroup && <Tooltip title="Default group"><StarIcon sx={{ fontSize: 14, color: 'warning.main' }} /></Tooltip>}
                <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>{group.weight}</Typography>
              </ListItemButton>
            )
          })}
          {filteredGroups.length === 0 && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', p: 2 }}>No groups match.</Typography>}
        </List>
      ) : (
        <>
          <List dense disablePadding sx={{ overflowY: 'auto', maxHeight: { xs: 240, md: 380 } }}>
            {filteredUsers.map((user) => {
              const selected = user.uuid === selectedUser
              return (
                <ListItemButton key={user.uuid} selected={selected} onClick={() => selectUser(user.uuid)} sx={{ borderLeft: 2, borderColor: selected ? 'primary.main' : 'transparent', py: 0.75, gap: 1 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: colorOf(user.name || user.uuid), flexShrink: 0 }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" noWrap>{user.name || user.uuid.slice(0, 8)}</Typography>
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{user.uuid}</Typography>
                  </Box>
                  {user.groups.length > 0 && <Chip size="small" label={user.groups.length} sx={{ height: 18, fontSize: 10.5 }} />}
                </ListItemButton>
              )
            })}
            {filteredUsers.length === 0 && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', p: 2 }}>No players yet.</Typography>}
          </List>
          <Divider />
          <Box component="form" onSubmit={(event) => { event.preventDefault(); void addPlayer() }} sx={{ p: 1.5 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <TextField fullWidth placeholder="Add player" value={newPlayer} onChange={(event) => setNewPlayer(event.target.value)} slotProps={{ htmlInput: { maxLength: 16, pattern: '[a-zA-Z0-9_]{1,16}' } }} />
              <IconButton type="submit" aria-label="Add player" disabled={busy || !newPlayer.trim()}><PersonAddAltIcon fontSize="small" /></IconButton>
            </Stack>
          </Box>
        </>
      )}
    </Paper>
  )

  const detail = (
    <Paper variant="outlined" sx={{ minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {tab === 'groups' ? (
        groupDraft ? (
          <>
            <Box sx={{ p: 2 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  {groupDraft.isNew ? (
                    <TextField
                      autoFocus fullWidth label="Group name" value={groupDraft.name}
                      onChange={(event) => updateGroup({ name: event.target.value })}
                      error={Boolean(groupDraft.name) && !groupPattern.test(groupDraft.name.trim().toLowerCase())}
                      helperText="Lowercase letters, digits, _ and -"
                    />
                  ) : (
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
                      <Typography variant="h6" sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{groupDraft.name}</Typography>
                      {groupDraft.name === store.defaultGroup && <Chip size="small" variant="outlined" color="warning" label="Default" />}
                    </Stack>
                  )}
                  <Typography variant="caption" color="text.secondary">{enabledNodes} of {totalNodes} permissions enabled</Typography>
                </Box>
                <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexShrink: 0 }}>
                  <TextField label="Weight" type="number" value={groupDraft.weight} onChange={(event) => updateGroup({ weight: event.target.value })} sx={{ width: 110 }} slotProps={{ htmlInput: { min: -1000, max: 1000 } }} />
                  {!groupDraft.isNew && groupDraft.name !== store.defaultGroup && (
                    <Tooltip title="Make default group"><span><IconButton disabled={busy} onClick={() => void makeDefault(groupDraft.name)} aria-label="Make default group"><StarBorderIcon fontSize="small" /></IconButton></span></Tooltip>
                  )}
                  {!groupDraft.isNew && groupDraft.name !== store.defaultGroup && (
                    <Tooltip title="Delete group"><span><IconButton disabled={busy} color="error" onClick={() => void deleteGroup(groupDraft.name)} aria-label="Delete group"><DeleteIcon fontSize="small" /></IconButton></span></Tooltip>
                  )}
                </Stack>
              </Stack>
              <Box sx={{ mt: 1.5 }}>
                <Autocomplete
                  multiple
                  options={sortedGroups.map((group) => group.name).filter((name) => name !== groupDraft.name)}
                  value={groupDraft.inherits}
                  onChange={(_, value) => updateGroup({ inherits: value })}
                  renderInput={(params) => <TextField {...params} label="Inherits" />}
                  slotProps={{ chip: { size: 'small' } }}
                />
              </Box>
            </Box>
            <Divider />
            <NodeEditor key={groupDraft.isNew ? '__new' : groupDraft.name} available={availableNodes} rows={groupDraft.nodes} status={status} disabled={busy} onSet={setGroupNode} onAdd={addNode} />
          </>
        ) : (
          <EmptyDetail title="No group selected" description="Create a group to start assigning permissions." action={<Button variant="outlined" startIcon={<AddIcon />} onClick={startNewGroup}>New group</Button>} />
        )
      ) : userDraft ? (
        <>
          <Box sx={{ p: 2 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>{userDraft.name || 'Player'}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userDraft.uuid}</Typography>
                <Typography variant="caption" color="text.secondary">{enabledNodes} of {totalNodes} permissions enabled</Typography>
              </Box>
              <Tooltip title="Remove player"><span><IconButton disabled={busy} color="error" onClick={() => void deleteUser(userDraft.uuid)} aria-label="Remove player"><DeleteIcon fontSize="small" /></IconButton></span></Tooltip>
            </Stack>
            <Box sx={{ mt: 1.5 }}>
              <Autocomplete
                multiple
                options={sortedGroups.map((group) => group.name)}
                value={userDraft.groups}
                onChange={(_, value) => updateUser({ groups: value })}
                renderInput={(params) => <TextField {...params} label="Groups" />}
                slotProps={{ chip: { size: 'small' } }}
              />
            </Box>
          </Box>
          <Divider />
          <NodeEditor key={userDraft.uuid} available={availableNodes} rows={userDraft.nodes} status={status} disabled={busy} onSet={setUserNode} onAdd={addNode} />
        </>
      ) : (
        <EmptyDetail title="No player selected" description="Add a player to give them groups or direct nodes." />
      )}
    </Paper>
  )

  const body = (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'flex-start' }, justifyContent: 'space-between' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography id={titleId} component="h2" variant="h6" sx={{ fontWeight: 600, lineHeight: 1.3 }}>{title}</Typography>
          <Typography variant="body2" color="text.secondary">{subtitle}</Typography>
        </Box>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexShrink: 0 }}>
          {tab === 'groups' && <Button variant="outlined" startIcon={<AddIcon />} onClick={startNewGroup} disabled={busy}>New group</Button>}
          {!inline && <IconButton onClick={() => { if (!busy) { flushGroup(); flushUser(); setOpen(false) } }} aria-label="Close permissions" disabled={busy}><CloseIcon /></IconButton>}
        </Stack>
      </Stack>
      <Tabs value={tab} onChange={(_, value: string) => changeTab(value)} aria-label="Permissions">
        <Tab label="Groups" value="groups" disabled={busy} />
        <Tab label="Players" value="players" disabled={busy} />
      </Tabs>
      <Typography variant="caption" color="text.secondary">
        Groups decide which nodes a player has. Direct player entries take priority, while heavier groups override lighter ones. Wildcards like <code>*</code> and <code>essentials.*</code> are supported.
      </Typography>
      {pending && <Alert severity="info">The permission plugin installs the next time each server starts. Restart a running server to enforce changes.</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '240px minmax(0, 1fr)' }, gap: 2, alignItems: 'start' }}>
        {sidebar}
        {detail}
      </Box>
    </Stack>
  )

  if (inline) return <Box>{body}</Box>

  return <>
    <Button size="small" onClick={() => { setOpen(true); setStatus('idle'); setError(''); if (!groupDraft && sortedGroups[0]) selectGroup(sortedGroups[0].name) }}>Permissions</Button>
    <Dialog open={open} onClose={() => { if (!busy) { flushGroup(); flushUser(); setOpen(false) } }} fullWidth maxWidth="lg" aria-labelledby={titleId}>
      <DialogContent sx={{ p: { xs: 2, sm: 3 } }}>{body}</DialogContent>
    </Dialog>
  </>
}

function NodeEditor({ available, rows, status, disabled, onSet, onAdd }: {
  available: string[]
  rows: NodeRow[]
  status: Status
  disabled: boolean
  onSet: (node: string, value: boolean | undefined) => void
  onAdd: (node: string) => void
}) {
  const [search, setSearch] = useState('')
  const [customOpen, setCustomOpen] = useState(false)
  const [custom, setCustom] = useState('')
  const assigned = new Map(rows.map((row) => [row.node, row.value]))
  const query = search.trim().toLowerCase()
  const nodes = [...new Set([...available, ...rows.map((row) => row.node)])]
    .filter((node) => !query || `${node} ${categoryOf(node)}`.toLowerCase().includes(query))
    .sort((a, b) => a.localeCompare(b))
  const exact = Boolean(query) && nodePattern.test(query) && !nodes.includes(query)

  return (
    <>
      <Box sx={{ p: 2, pb: 1 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <TextField
            fullWidth placeholder="Search permission nodes" value={search}
            onChange={(event) => setSearch(event.target.value)}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
          />
          <Tooltip title="Add custom node"><span><IconButton disabled={disabled} onClick={() => setCustomOpen((value) => !value)} aria-label="Add custom node"><AddIcon /></IconButton></span></Tooltip>
        </Stack>
        {customOpen && (
          <Stack component="form" direction="row" spacing={1} sx={{ mt: 1 }} onSubmit={(event) => { event.preventDefault(); onAdd(custom); setCustom(''); setCustomOpen(false) }}>
            <TextField autoFocus fullWidth placeholder="e.g. essentials.*" value={custom} onChange={(event) => setCustom(event.target.value)} slotProps={{ htmlInput: { maxLength: 128, spellCheck: false } }} />
            <Button type="submit" disabled={!custom.trim()}>Add</Button>
          </Stack>
        )}
      </Box>
      <Box sx={{ overflowY: 'auto', maxHeight: { xs: 360, md: 440 } }}>
        {nodes.length === 0 ? (
          <Box sx={{ px: 2, py: 3, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">{query ? 'No nodes match your search.' : 'No permission nodes yet.'}</Typography>
            <Typography variant="caption" color="text.secondary">{query ? 'Use the + button to add it as a custom node.' : 'Start a server so the plugin can report its nodes, or add a custom node.'}</Typography>
            {exact && <Box sx={{ mt: 1.5 }}><Button size="small" startIcon={<AddIcon />} onClick={() => { onAdd(query); setSearch('') }}>Allow {query}</Button></Box>}
          </Box>
        ) : nodes.map((node) => {
          const value = assigned.get(node)
          const denied = value === false
          return (
            <Box key={node} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 0.75, borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 }, '&:hover': { bgcolor: 'action.hover' } }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5, color: denied ? 'error.main' : 'text.primary', textDecoration: denied ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node}</Typography>
                  <Chip size="small" variant="outlined" label={categoryOf(node)} sx={{ height: 18, fontSize: 10.5, flexShrink: 0 }} />
                </Stack>
                {denied && <Typography variant="caption" color="error">Denied</Typography>}
              </Box>
              <Tooltip title={denied ? 'Remove denial' : 'Deny this node'}><IconButton size="small" disabled={disabled} onClick={() => onSet(node, denied ? undefined : false)} aria-label={denied ? `Remove denial for ${node}` : `Deny ${node}`} sx={{ color: denied ? 'error.main' : 'text.disabled' }}><BlockIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
              <Checkbox size="small" disabled={disabled} checked={value === true} onChange={(event) => onSet(node, event.target.checked ? true : undefined)} sx={{ p: 0.5 }} slotProps={{ input: { 'aria-label': `Allow ${node}` } }} />
            </Box>
          )
        })}
      </Box>
      {status !== 'idle' && (
        <Box sx={{ px: 2, py: 1, borderTop: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
          <SaveStatus status={status} />
        </Box>
      )}
    </>
  )
}

function SaveStatus({ status }: { status: Status }) {
  if (status === 'saving') return <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}><CircularProgress size={12} /><Typography variant="caption" color="text.secondary">Saving…</Typography></Stack>
  if (status === 'saved') return <Stack direction="row" spacing={0.25} sx={{ alignItems: 'center', color: 'success.main' }}><CheckIcon sx={{ fontSize: 16 }} /><Typography variant="caption">All changes saved</Typography></Stack>
  if (status === 'invalid') return <Typography variant="caption" color="warning.main">Enter a valid name and weight</Typography>
  if (status === 'error') return <Typography variant="caption" color="error">Not saved</Typography>
  return null
}

function EmptyDetail({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <Box sx={{ p: 4, textAlign: 'center' }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{description}</Typography>
      {action && <Box sx={{ mt: 2 }}>{action}</Box>}
    </Box>
  )
}
