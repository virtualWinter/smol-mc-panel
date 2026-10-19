import { Box } from '@mui/material'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import ServerCard from './ServerCard'
import type { ServerProps } from '../types'

export default function SortableServerRow({ server, reorderable = true }: ServerProps & { reorderable?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: server.id, disabled: reorderable ? undefined : { draggable: true, droppable: true } })
  return (
    <Box
      ref={setNodeRef}
      {...(reorderable ? { ...attributes, ...listeners } : {})}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      sx={{
        display: 'flex', alignItems: 'center', position: 'relative', zIndex: isDragging ? 1 : 0,
        cursor: reorderable ? (isDragging ? 'grabbing' : 'grab') : 'default',
        borderTop: 1, borderColor: 'divider', bgcolor: isDragging ? 'action.selected' : 'transparent',
        opacity: isDragging ? 0.85 : 1, '&:first-of-type': { borderTop: 0 },
        '&:hover': { bgcolor: 'action.hover' },
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
        '& > a': { flex: 1, minWidth: 0, '&:hover': { bgcolor: 'transparent' } },
      }}
    >
      <ServerCard server={server} />
    </Box>
  )
}
