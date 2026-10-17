import { Box, IconButton } from '@mui/material'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import ServerCard from './ServerCard'
import type { ServerProps } from '../types'

export default function SortableServerRow({ server }: ServerProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: server.id })
  return (
    <Box ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} sx={{ display: 'flex', alignItems: 'center', position: 'relative', zIndex: isDragging ? 1 : 0, bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden', opacity: isDragging ? 0.8 : 1, '&:hover': { borderColor: 'text.secondary' }, '& > a': { flex: 1, minWidth: 0 } }}>
      <IconButton ref={setActivatorNodeRef} {...attributes} {...listeners} aria-label={`Reorder ${server.name}`} size="small" sx={{ ml: 0.5, color: 'text.disabled', cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none', '&:hover, &:focus-visible': { color: 'text.primary' } }}>
        <DragIndicatorIcon fontSize="small" />
      </IconButton>
      <ServerCard server={server} />
    </Box>
  )
}
