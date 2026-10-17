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
- `src/App.tsx` is the server component: it resolves routes and loads the authoritative server snapshot.
- `src/server/` holds the server-only mock data/store and validated Server Functions. Power actions, commands, settings, reordering, file moves/uploads/edits, and backup actions all run there. The in-memory store survives navigation and browser reloads but resets with the server process.
- `src/main.tsx` supplies theme and snapshot context. Pages render HTML on the server and hydrate interactive controls in the browser. Only xterm is initialized lazily in the browser. No client-only app mounting or React Router is needed.
- Server Functions use the app's own POST transport, not a separate REST API. They are still network-callable endpoints.
- Development and preview bind to loopback by default. Authentication and per-action authorization must be implemented before remote deployment or real process/filesystem operations. The origin check is CSRF protection, not authentication.
- Server operations still simulate Minecraft management; no real processes are started, host files changed, or backups created. Preview uploads are limited to 512 KiB per file. Changes are shared between browsers connected to this process, not stored in browser state.
