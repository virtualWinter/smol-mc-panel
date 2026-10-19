'use client'

import { useMemo, useState } from 'react'
import { Alert, Box, Button, Collapse, IconButton, InputAdornment, Stack, TextField, Typography } from '@mui/material'
import FolderIcon from '@mui/icons-material/Folder'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined'
import { logout } from '../server/auth-actions'
import SearchIcon from '@mui/icons-material/Search'
import SortableServerRow from './SortableServerRow'
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, useDroppable } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from './sortConstraints'
import { usePanel } from '../data/usePanel'
import NetworkServers from './NetworkServers'
import NetworkPlayers from './NetworkPlayers'
import NetworkPermissions from './NetworkPermissions'
import DroppableGroup from './DroppableGroup'

interface Group { name: string; servers: ReturnType<typeof usePanel>['servers'] }

export default function ServerOverview() {
  const { servers, reorderServers, saveSettings } = usePanel()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const filtered = servers.filter((server) => `${server.name} ${server.address} ${server.group ?? ''}`.toLowerCase().includes(search.toLowerCase()))

  const groups = useMemo(() => {
    const map = new Map<string, typeof servers>()
    for (const server of filtered) {
      const key = server.group?.trim() ?? ''
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(server)
    }
    const keys = [...map.keys()].sort((a, b) => {
      if (a === '' && b !== '') return 1
      if (b === '' && a !== '') return -1
      return a.localeCompare(b)
    })
    return keys.map((name) => ({ name, servers: map.get(name)! }))
  }, [filtered])

  const groupOf = (id: string) => filtered.find((server) => server.id === id)?.group?.trim() ?? ''

  const toggle = (name: string) => setCollapsed((current) => ({ ...current, [name]: !current[name] }))

  const handleDragEnd = async ({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) => {
    if (!over) return
    const activeId = String(active.id), overId = String(over.id)
    if (activeId === overId) return
    const sourceGroup = groupOf(activeId)
    const destGroup = overId.startsWith('group:') ? overId.slice('group:'.length) : groupOf(overId)
    const moving = filtered.find((server) => server.id === activeId)
    if (!moving) return
    try {
      if (sourceGroup !== destGroup) await saveSettings(activeId, { ...moving, group: destGroup })
      if (!overId.startsWith('group:')) await reorderServers(activeId, overId)
    } catch (error) {
      setError(String(error))
    }
  }

  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography component="h1" variant="h6" sx={{ fontWeight: 600 }}>Network</Typography>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}><TextField
           placeholder="Search servers"
          size="small"
           sx={{ width: { xs: 150, sm: 240 } }}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          slotProps={{
            htmlInput: { 'aria-label': 'Search network' },
            input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> },
          }}
        /><IconButton aria-label="Sign out" onClick={() => { void logout().catch((error: unknown) => setError(String(error))) }}><LogoutOutlinedIcon fontSize="small" /></IconButton></Stack>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      <Stack direction="row" spacing={1}><NetworkServers /><NetworkPlayers /><NetworkPermissions /></Stack>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <Stack spacing={2}>
          {groups.map((group) => {
            const isCollapsed = Boolean(collapsed[group.name])
            const label = group.name === '' ? 'Ungrouped' : group.name
            const droppableId = `group:${group.name}`
            return (
              <DroppableGroup key={group.name === '' ? '__ungrouped' : group.name} id={droppableId}>
                {(setNodeRef, isOver) => (
                  <Box ref={setNodeRef} sx={{ border: 1, borderColor: isOver ? 'primary.main' : 'divider', borderRadius: 1, overflow: 'hidden', bgcolor: isOver ? 'action.selected' : 'transparent' }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 1.5, py: 1, bgcolor: 'action.hover', cursor: 'pointer' }} onClick={() => toggle(group.name)}>
                      {isCollapsed ? <ChevronRightIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                      {isCollapsed ? <FolderIcon fontSize="small" sx={{ color: 'text.secondary' }} /> : <FolderOpenIcon fontSize="small" sx={{ color: 'text.secondary' }} />}
                      <Typography variant="subtitle2" sx={{ fontWeight: 600, flex: 1 }}>{label}</Typography>
                      <Typography variant="caption" color="text.secondary">{group.servers.length}</Typography>
                    </Stack>
                    <Collapse in={!isCollapsed}>
                      <SortableContext items={group.servers.map((server) => server.id)} strategy={verticalListSortingStrategy}>
                        <Stack spacing={1} sx={{ p: 1, minHeight: 40 }}>
                          {group.servers.map((server) => <SortableServerRow key={server.id} server={server} />)}
                          {group.servers.length === 0 && <Typography variant="caption" color="text.secondary" sx={{ py: 1, textAlign: 'center' }}>Drop servers here</Typography>}
                        </Stack>
                      </SortableContext>
                    </Collapse>
                  </Box>
                )}
              </DroppableGroup>
            )
          })}
          {filtered.length === 0 && <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>No matches</Typography>}
        </Stack>
        </DndContext>
    </Stack>
  )
}
