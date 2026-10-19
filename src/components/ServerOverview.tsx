'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Box, InputAdornment, Stack, TextField, Typography } from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import SortableServerRow from './SortableServerRow'
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { usePanel } from '../data/usePanel'
import NetworkServers from './NetworkServers'
import SortableFolder from './SortableFolder'
import type { Server } from '../types'

function grouped(servers: Server[], groupOrder: string[]) {
  const map = new Map<string, Server[]>()
  for (const server of servers) {
    if (server.kind === 'velocity') continue
    const key = server.group?.trim() ?? ''
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(server)
  }
  const ordered: string[] = []
  for (const name of groupOrder) if (map.has(name) && !ordered.includes(name)) ordered.push(name)
  for (const name of [...map.keys()].sort()) if (name !== '' && !ordered.includes(name)) ordered.push(name)
  if (map.has('')) ordered.push('')
  return ordered.map((name) => ({ name, servers: map.get(name)! }))
}

export default function ServerOverview() {
  const { servers, networkPlayers, reorderServers, saveSettings, setGroupOrder, groupOrder } = usePanel()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  // Rows and folder headers are draggable as a whole, so a drag ends on top of a link. Swallow the
  // click that follows any pointer movement past the drag threshold, otherwise dragging opens a page.
  const pointerStart = useRef<{ x: number; y: number } | null>(null)
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => { pointerStart.current = { x: event.clientX, y: event.clientY } }
    const onClick = (event: MouseEvent) => {
      const start = pointerStart.current
      pointerStart.current = null
      if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) <= 5) return
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('click', onClick, true)
    }
  }, [])


  const query = search.trim().toLowerCase()
  const matches = (server: Server) => `${server.name} ${server.address} ${server.group ?? ''}`.toLowerCase().includes(query)
  const proxy = servers.find((server) => server.kind === 'velocity' && matches(server))
  const allGroups = useMemo(() => grouped(servers, groupOrder), [servers, groupOrder])
  const groups = allGroups.map((group) => ({ ...group, servers: group.servers.filter(matches) })).filter((group) => group.servers.length > 0)
  const folderItems = groups.filter((group) => group.name !== '').map((group) => `folder:${group.name}`)
  const groupOf = (id: string) => servers.find((server) => server.id === id)?.group?.trim() ?? ''
  const onlinePlayers = new Set(networkPlayers.map((player) => player.uuid)).size

  const toggle = (name: string) => setCollapsed((current) => ({ ...current, [name]: !current[name] }))

  const handleDragEnd = async ({ active, over }: DragEndEvent) => {
    if (!over) return
    const activeId = String(active.id), overId = String(over.id)
    if (activeId === overId) return
    try {
      if (activeId.startsWith('folder:')) {
        const from = activeId.slice('folder:'.length)
        const to = overId.startsWith('folder:') ? overId.slice('folder:'.length)
          : overId.startsWith('group:') ? overId.slice('group:'.length)
          : groupOf(overId)
        if (!from || !to || from === to) return
        const names = allGroups.map((group) => group.name).filter(Boolean)
        const fromIndex = names.indexOf(from), toIndex = names.indexOf(to)
        if (fromIndex < 0 || toIndex < 0) return
        const next = [...names]
        const [moved] = next.splice(fromIndex, 1)
        next.splice(toIndex, 0, moved)
        await setGroupOrder(next)
        return
      }
      const sourceGroup = groupOf(activeId)
      const destGroup = overId.startsWith('group:') ? overId.slice('group:'.length)
        : overId.startsWith('folder:') ? overId.slice('folder:'.length)
        : groupOf(overId)
      const moving = servers.find((server) => server.id === activeId)
      if (!moving) return
      if (sourceGroup !== destGroup) await saveSettings(activeId, { ...moving, group: destGroup })
      if (!overId.startsWith('group:') && !overId.startsWith('folder:')) await reorderServers(activeId, overId)
    } catch (error) {
      setError(String(error))
    }
  }

  return (
    <Stack spacing={2.5}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h1" variant="h6" sx={{ fontWeight: 600 }}>Network</Typography>
          <Typography variant="caption" color="text.secondary">{servers.length} {servers.length === 1 ? 'server' : 'servers'} · {onlinePlayers} online</Typography>
        </Box>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <TextField
            placeholder="Search servers"
            sx={{ width: { xs: 150, sm: 240 } }}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            slotProps={{
              htmlInput: { 'aria-label': 'Search network' },
              input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> },
            }}
          />
          <NetworkServers />
        </Stack>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <Stack spacing={1.5}>
          {proxy && (
            <SortableContext items={[proxy.id]} strategy={verticalListSortingStrategy}>
              <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
                <SortableServerRow server={proxy} reorderable={false} />
              </Box>
            </SortableContext>
          )}
          <SortableContext items={folderItems} strategy={verticalListSortingStrategy}>
            {groups.map((group) => (
              <SortableFolder
                key={group.name === '' ? '__ungrouped' : group.name}
                name={group.name}
                label={group.name === '' ? 'Ungrouped' : group.name}
                servers={group.servers}
                collapsed={Boolean(collapsed[group.name])}
                onToggle={() => toggle(group.name)}
              />
            ))}
          </SortableContext>
          {!proxy && groups.length === 0 && <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>No matches</Typography>}
        </Stack>
      </DndContext>
    </Stack>
  )
}
