import { useState } from 'react'
import type { DragEvent } from 'react'
import { useMock } from '../data/MockProvider'

const dragType = 'application/x-smol-file'

export default function useFileManager(serverId: string) {
  const { files, moveFile, uploadFiles, saveFile } = useMock()
  const entries = files[serverId] ?? []
  const [notice, setNotice] = useState('')
  const [target, setTarget] = useState<string | null>(null)
  const accepts = (event: DragEvent) => event.dataTransfer.types.includes(dragType) || event.dataTransfer.types.includes('Files')
  const drop = async (event: DragEvent, destination: string) => {
    event.preventDefault()
    event.stopPropagation()
    setTarget(null)
    setNotice('')
    const source = event.dataTransfer.getData(dragType)
    try {
      if (source) { await moveFile(serverId, source, destination); return }
      if ([...event.dataTransfer.items].some((item) => item.webkitGetAsEntry?.()?.isDirectory)) {
        setNotice('Drop individual files; folder uploads are not supported yet.')
        return
      }
      const data = new FormData()
      for (const file of event.dataTransfer.files) data.append('files', file)
      await uploadFiles(serverId, destination, data)
    } catch (error) { setNotice(String(error)) }
  }
  const dropProps = (destination: string) => ({
    onDragOver: (event: DragEvent) => {
      if (!accepts(event)) return
      event.preventDefault()
      event.stopPropagation()
      event.dataTransfer.dropEffect = event.dataTransfer.types.includes(dragType) ? 'move' : 'copy'
      setTarget(destination)
    },
    onDragLeave: (event: DragEvent) => {
      if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setTarget(null)
    },
    onDrop: (event: DragEvent) => { void drop(event, destination) },
  })
  const dragProps = (path: string) => ({
    draggable: true,
    onDragStart: (event: DragEvent) => { event.dataTransfer.setData(dragType, path); event.dataTransfer.effectAllowed = 'move' },
    onDragEnd: () => setTarget(null),
  })
  return { entries, saveFile, notice, setNotice, target, dropProps, dragProps }
}
