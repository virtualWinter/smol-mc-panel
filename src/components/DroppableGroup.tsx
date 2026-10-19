'use client'

import { useDroppable } from '@dnd-kit/core'

export default function DroppableGroup({ id, children }: { id: string; children: (setNodeRef: (node: HTMLElement | null) => void, isOver: boolean) => React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return <>{children(setNodeRef, isOver)}</>
}