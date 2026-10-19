'use server'

import { runtime } from './store'
import { moveEntry, readText, uploadEntries, writeText } from './files'
import { PanelError } from './errors'
import type { Server, SetupServerInput } from '../types'
import type { PluginProject } from '../types'
import type { PlayerAction } from './players'
import type { PermissionGroupInput, PermissionUserInput } from './permissions'

export async function powerServer(id: string, action: 'Start' | 'Restart' | 'Stop') {
  if (!['Start', 'Restart', 'Stop'].includes(action)) throw new PanelError('Invalid power action.')
  await runtime().power(id, action)
}

export async function sendCommand(id: string, command: string) {
  const config = runtime().config(id)
  if (typeof command !== 'string') throw new PanelError('Invalid command.')
  if (config.kind === 'paper' && /(?:^\/?|\brun\s+)(?:minecraft:)?whitelist\s+on(?:\s|$)/iu.test(command.trim())) throw new PanelError('Whitelisting is disabled for Paper servers.')
  runtime().manager.command(id, command)
}

export async function saveSettings(id: string, input: Partial<Server>) { runtime().saveSettings(id, input) }
export async function reorderServers(activeId: string, overId: string) { runtime().reorder(activeId, overId) }
export async function setGroupOrder(order: string[]) { runtime().setGroupOrder(order) }
export async function acceptEula(id: string) { runtime().acceptEula(id) }
export async function reinstallServer(id: string) { await runtime().reinstall(id) }
export async function addServer(input: SetupServerInput) { runtime().addServer(input) }
export async function removeServer(id: string) { runtime().removeServer(id) }

export async function moveFile(id: string, source: string, destination: string) {
  await runtime().withFileWrite(id, () => moveEntry(runtime().directory(id), source, destination))
}
export async function uploadFiles(id: string, destination: string, data: FormData) {
  await runtime().withFileWrite(id, () => uploadEntries(runtime().directory(id), destination, data))
}
export async function readFile(id: string, path: string) { return readText(runtime().directory(id), path) }
export async function saveFile(id: string, path: string, content: string) {
  await runtime().withFileWrite(id, () => writeText(runtime().directory(id), path, content))
}
export async function createBackup(id: string) { await runtime().createBackup(id) }
export async function deleteBackup(id: string, backupId: string) { await runtime().deleteBackup(id, backupId) }
export async function restoreBackup(id: string, backupId: string) { await runtime().restoreBackup(id, backupId) }
export async function refreshBackups(id: string) { await runtime().refreshBackups(id) }
export async function saveBackupSchedule(id: string, enabled: boolean, hour: number, retain: number) { runtime().saveBackupSchedule(id, enabled, hour, retain) }
export async function searchPlugins(id: string, source: PluginProject['source'], query: string) { return runtime().searchPlugins(id, source, query) }
export async function pluginVersions(id: string, source: PluginProject['source'], project: string, gameVersion: string) { return runtime().pluginVersions(id, source, project, gameVersion) }
export async function installPlugin(id: string, source: PluginProject['source'], project: string, version: string, gameVersion: string) { await runtime().installPlugin(id, source, project, version, gameVersion) }
export async function removePlugin(id: string, source: PluginProject['source'], project: string) { await runtime().removePlugin(id, source, project) }
export async function managePlayer(action: PlayerAction, name: string) { await runtime().managePlayer(action, name) }

export async function savePermissionGroup(scope: string, input: PermissionGroupInput) { runtime().savePermissionGroup(scope, input) }
export async function removePermissionGroup(scope: string, name: string) { runtime().removePermissionGroup(scope, name) }
export async function setDefaultPermissionGroup(scope: string, name: string) { runtime().setDefaultPermissionGroup(scope, name) }
export async function savePermissionUser(scope: string, input: PermissionUserInput) { runtime().savePermissionUser(scope, input) }
export async function removePermissionUser(scope: string, uuid: string) { runtime().removePermissionUser(scope, uuid) }
export async function trackPermissionUser(scope: string, name: string) { return runtime().trackPermissionUser(scope, name) }
