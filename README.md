# smol mc panel

Minecraft network panel using Vite, React Server Components, TypeScript, and Material UI.

## Development

```sh
pnpm install
pnpm dev
```

## Checks and production build

```sh
pnpm lint
pnpm typecheck
pnpm build
pnpm preview
```

## Server architecture

- `src/framework/` contains the RSC request handler, HTML renderer, and browser transport.
- `src/server/actions.ts` exposes Server Functions with `use server`. The server list is currently mock data.
- `src/main.tsx` is the client boundary. The interactive panel mounts in the browser (including xterm and React Router); the document is rendered on the server.
- Server Functions use the app's own POST transport, not a separate REST API. They are still network-callable endpoints.
- Development and preview bind to loopback by default. Authentication and per-action authorization must be implemented before remote deployment or real process/filesystem operations. The origin check is CSRF protection, not authentication.
- Power controls, file changes, settings, and backups remain local mock interactions. No Minecraft processes are started.
