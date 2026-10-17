'use server'

import { networkServers } from '../data/mockData'

// Read-only mock source until authentication and real server management are added.
export async function getServers() {
  return structuredClone(networkServers)
}
