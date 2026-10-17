'use client'

import { useState } from 'react'
import { Alert, IconButton, InputAdornment, Stack, TextField, Typography } from '@mui/material'
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined'
import { logout } from '../server/auth-actions'
import SearchIcon from '@mui/icons-material/Search'
import SortableServerRow from './SortableServerRow'
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from './sortConstraints'
import { usePanel } from '../data/usePanel'

export default function ServerOverview() {
  const { servers, reorderServers } = usePanel()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const filtered = servers.filter((server) => `${server.name} ${server.address}`.toLowerCase().includes(search.toLowerCase()))

  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography component="h1" variant="h6" sx={{ fontWeight: 600 }}>Network</Typography>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}><TextField
          placeholder="Search network…"
          size="small"
          sx={{ width: { xs: 180, sm: 240 } }}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          slotProps={{
            htmlInput: { 'aria-label': 'Search network' },
            input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> },
          }}
        /><IconButton aria-label="Sign out" onClick={() => { void logout().catch((error: unknown) => setError(String(error))) }}><LogoutOutlinedIcon fontSize="small" /></IconButton></Stack>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
        <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={({ active, over }) => { if (over) void reorderServers(String(active.id), String(over.id)).catch((error: unknown) => window.alert(String(error))) }}>
        <SortableContext items={filtered.map((server) => server.id)} strategy={verticalListSortingStrategy}>
        <Stack spacing={2}>
          {filtered.map((server) => <SortableServerRow key={server.id} server={server} />)}
          {filtered.length === 0 && <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>No matches</Typography>}
        </Stack>
        </SortableContext>
        </DndContext>
    </Stack>
  )
}
