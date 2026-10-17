'use server'

import { runtime } from './store'
import { moveEntry, readText, uploadEntries, writeText } from './files'
import { PanelError } from './errors'
import type { Server } from '../types'

export async function powerServer(id: string, action: 'Start' | 'Restart' | 'Stop') {
  if (!['Start', 'Restart', 'Stop'].includes(action)) throw new PanelError('Invalid power action.')
  await runtime().power(id, action)
}

export async function sendCommand(id: string, command: string) {
  runtime().config(id)
  runtime().manager.command(id, command)
}

export async function saveSettings(id: string, input: Partial<Server>) { runtime().saveSettings(id, input) }
export async function reorderServers(activeId: string, overId: string) { runtime().reorder(activeId, overId) }
export async function acceptEula(id: string) { runtime().acceptEula(id) }

export async function moveFile(id: string, source: string, destination: string) {
  await runtime().withWrite(id, () => moveEntry(runtime().directory(id), source, destination))
}
export async function uploadFiles(id: string, destination: string, data: FormData) {
  await runtime().withWrite(id, () => uploadEntries(runtime().directory(id), destination, data))
}
export async function readFile(id: string, path: string) { return readText(runtime().directory(id), path) }
export async function saveFile(id: string, path: string, content: string) { await runtime().withWrite(id, () => writeText(runtime().directory(id), path, content)) }
export async function createBackup(id: string) { await runtime().createBackup(id) }
export async function deleteBackup(id: string, backupId: string) { runtime().deleteBackup(id, backupId) }
