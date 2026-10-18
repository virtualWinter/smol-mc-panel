import react from '@vitejs/plugin-react'
import rsc from '@vitejs/plugin-rsc'
import { defineConfig } from 'vite'

// Behind a reverse proxy the listener must accept the declared external origin;
// local/loopback use keeps Vite's default host checks.
const externalOrigin = process.env.PANEL_ORIGIN
const allowedHosts = externalOrigin && URL.canParse(externalOrigin) ? [new URL(externalOrigin).hostname] : undefined

export default defineConfig({
  plugins: [rsc({ entries: {
    rsc: './src/framework/entry.rsc.tsx',
    ssr: './src/framework/entry.ssr.tsx',
    client: './src/framework/entry.browser.tsx',
  } }), react()],
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1', ...(allowedHosts ? { allowedHosts } : {}) },
})
