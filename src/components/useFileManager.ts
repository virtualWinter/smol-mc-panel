import { useState } from 'react'
import type { DragEvent } from 'react'
import { usePanel } from '../data/usePanel'

const dragType = 'application/x-smol-file'

export default function useFileManager(serverId: string) {
  const { files, filePath, moveFile, uploadFiles, saveFile, readFile } = usePanel()
  const entries = files[serverId] ?? []
  const [notice, setNotice] = useState('')
  const [target, setTarget] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const upload = async (destination: string, selected: FileList | File[]) => {
    if (uploading || !selected.length) return
    setNotice(''); setUploading(true)
    try {
      const data = new FormData()
      for (const file of Array.from(selected)) data.append('files', file)
      await uploadFiles(serverId, destination, data)
      setNotice('Uploaded')
    } finally { setUploading(false) }
  }
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
      await upload(destination, event.dataTransfer.files)
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
  return { entries, filePath, saveFile, readFile, notice, setNotice, target, dropProps, dragProps, upload, uploading }
}
