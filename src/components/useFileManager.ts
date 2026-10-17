import { useState } from 'react'
import type { DragEvent } from 'react'
import { serverFiles } from '../data/mockData'
import type { ServerFile } from '../types'

const dragType = 'application/x-smol-file'
interface Entry extends ServerFile { path: string; content?: string; binary?: boolean }

export default function useFileManager(serverId: string) {
  const [entries, setEntries] = useState<Entry[]>(() => (serverFiles[serverId] ?? []).map((file) => ({ ...file, path: file.name, binary: file.name.endsWith('.jar') })))
  const [notice, setNotice] = useState('')
  const [target, setTarget] = useState<string | null>(null)
  const accepts = (event: DragEvent) => event.dataTransfer.types.includes(dragType) || event.dataTransfer.types.includes('Files')
  const drop = async (event: DragEvent, destination: string) => {
    event.preventDefault()
    event.stopPropagation()
    setTarget(null)
    setNotice('')
    const source = event.dataTransfer.getData(dragType)
    if (source) {
      const entry = entries.find((item) => item.path === source)
      if (!entry) return
      const next = [destination, entry.name].filter(Boolean).join('/')
      if (next === source) return
      if (destination === source || destination.startsWith(`${source}/`)) { setNotice('A folder cannot be moved into itself.'); return }
      if (entries.some((item) => item.path === next)) { setNotice('An item with that name already exists.'); return }
      setEntries((current) => current.map((item) => item.path === source || item.path.startsWith(`${source}/`) ? { ...item, path: next + item.path.slice(source.length) } : item))
      return
    }
    if ([...event.dataTransfer.items].some((item) => item.webkitGetAsEntry?.()?.isDirectory)) {
      setNotice('Drop individual files; folder uploads are not supported yet.')
      return
    }
    const files = [...event.dataTransfer.files]
    if (files.some((file) => file.size > 10 * 1024 * 1024)) { setNotice('Preview uploads are limited to 10 MiB per file.'); return }
    try {
      const uploaded = await Promise.all(files.map(async (file): Promise<Entry> => {
        const buffer = new Uint8Array(await file.arrayBuffer())
        const binary = file.name.endsWith('.jar') || buffer.includes(0)
        return { name: file.name, path: '', size: file.size < 1024 ? `${file.size} B` : `${(file.size / 1024).toFixed(1)} KB`, modified: new Date().toLocaleString(), binary, content: binary ? undefined : new TextDecoder().decode(buffer) }
      }))
      setEntries((current) => {
        const result = [...current]
        for (const file of uploaded) {
          let name = file.name
          let suffix = 1
          const fullPath = () => [destination, name].filter(Boolean).join('/')
          while (result.some((item) => item.path === fullPath())) name = `${file.name} (${suffix++})`
          result.push({ ...file, name, path: fullPath() })
        }
        return result
      })
      if (files.length) setNotice(`${files.length} file${files.length === 1 ? '' : 's'} added locally.`)
    } catch { setNotice('Could not read the dropped files.') }
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
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setTarget(null)
    },
    onDrop: (event: DragEvent) => { void drop(event, destination) },
  })
  const dragProps = (path: string) => ({
    draggable: true,
    onDragStart: (event: DragEvent) => { event.dataTransfer.setData(dragType, path); event.dataTransfer.effectAllowed = 'move' },
    onDragEnd: () => setTarget(null),
  })
  return { entries, setEntries, notice, setNotice, target, dropProps, dragProps }
}
