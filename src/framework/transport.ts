export async function requireRscResponse(response: Response): Promise<Response> {
  if (!response.ok) {
    if (response.status === 403) throw new Error('Access denied. Complete setup locally or sign in again.')
    if (response.status === 413) throw new Error('The upload exceeds the request size limit.')
    throw new Error(`The panel server returned HTTP ${response.status}. Check that the server is running and reload.`)
  }
  if (!response.headers.get('content-type')?.includes('text/x-component') || !response.body) throw new Error('The server returned an invalid panel response. Reload after restarting the panel.')
  return response
}

export function connectionError(error: unknown): Error {
  if (error instanceof Error && /(?:Connection closed|Minified React error #412|Failed to fetch|fetch failed|NetworkError|Load failed)/iu.test(error.message)) return new Error('The connection to the panel was interrupted. Check that it is running, then reload.')
  return error instanceof Error ? error : new Error('The panel request failed. Reload to try again.')
}
