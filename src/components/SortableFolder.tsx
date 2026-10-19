'use client'

import { Box, Collapse, IconButton, Stack, Typography } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import NetworkPermissions from './NetworkPermissions'
import SortableServerRow from './SortableServerRow'
import type { Server } from '../types'

export default function SortableFolder({ name, label, servers, collapsed, onToggle }: {
  name: string
  label: string
  servers: Server[]
  collapsed: boolean
  onToggle: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `folder:${name}`, disabled: name === '' })
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({ id: `group:${name}` })
  const dragProps = name ? { ...attributes, ...listeners, 'aria-label': `Reorder ${label}` } : {}
  const setNode = (node: HTMLElement | null) => {
    setNodeRef(node)
    setDroppableRef(node)
  }
  return (
    <Box
      ref={setNode}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      sx={{
        position: 'relative', zIndex: isDragging ? 1 : 0, opacity: isDragging ? 0.85 : 1,
        border: 1, borderColor: isOver ? 'primary.main' : 'divider', borderRadius: 1, overflow: 'hidden',
        bgcolor: isOver ? 'action.selected' : 'transparent',
      }}
    >
      <Stack
        direction="row" spacing={0.5} {...dragProps}
        sx={{
          alignItems: 'center', px: 0.75, py: 0.5, borderBottom: collapsed ? 0 : 1, borderColor: 'divider',
          cursor: name ? (isDragging ? 'grabbing' : 'grab') : 'default',
          '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
        }}
      >
        <IconButton size="small" aria-label={collapsed ? `Expand ${label}` : `Collapse ${label}`} onClick={onToggle} sx={{ color: 'text.secondary' }}>
          <ExpandMoreIcon fontSize="small" sx={{ transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 150ms' }} />
        </IconButton>
        <Typography variant="subtitle2" noWrap onClick={onToggle} sx={{ fontWeight: 600, flex: 1, minWidth: 0, cursor: 'pointer' }}>{label}</Typography>
        <Typography variant="caption" color="text.secondary">{servers.length}</Typography>
        {name && <NetworkPermissions scope={`group:${name}`} />}
      </Stack>
      <Collapse in={!collapsed}>
        <SortableContext items={servers.map((server) => server.id)} strategy={verticalListSortingStrategy}>
          <Box sx={{ minHeight: 40 }}>
            {servers.map((server) => <SortableServerRow key={server.id} server={server} />)}
            {servers.length === 0 && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', py: 2, textAlign: 'center' }}>Drop servers here</Typography>}
          </Box>
        </SortableContext>
      </Collapse>
    </Box>
  )
}
