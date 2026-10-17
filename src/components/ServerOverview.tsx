import { useState } from 'react'
import { Divider, InputAdornment, Paper, Stack, TextField, Typography } from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import SortableServerRow from './SortableServerRow'
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from './sortConstraints'
import { useMock } from '../data/MockProvider'

export default function ServerOverview() {
  const { servers, reorderServers } = useMock()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const [search, setSearch] = useState('')
  const filtered = servers.filter((server) => `${server.name} ${server.address}`.toLowerCase().includes(search.toLowerCase()))

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography component="h1" variant="h6" sx={{ fontWeight: 600 }}>Network</Typography>
        <TextField
          placeholder="Search network…"
          size="small"
          sx={{ width: { xs: 180, sm: 240 } }}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          slotProps={{
            htmlInput: { 'aria-label': 'Search network' },
            input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> },
          }}
        />
      </Stack>
      <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={({ active, over }) => { if (over) reorderServers(String(active.id), String(over.id)) }}>
        <SortableContext items={filtered.map((server) => server.id)} strategy={verticalListSortingStrategy}>
        <Stack divider={<Divider />}>
          {filtered.map((server) => <SortableServerRow key={server.id} server={server} />)}
          {filtered.length === 0 && <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>No matches</Typography>}
        </Stack>
        </SortableContext>
        </DndContext>
      </Paper>
    </Stack>
  )
}
