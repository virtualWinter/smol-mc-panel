# smol mc panel

A single-network Minecraft panel: one Velocity proxy and Paper backends, managed as local Java processes. React Server Components and Server Functions handle all server operations; there is no standalone REST API.

## Run

Requires Node.js 22.18+, pnpm, Java, and `tar` (for backups). Linux provides CPU/RAM metrics.

```sh
pnpm install
pnpm dev
```

The first request creates `network/` with persistent `panel.json`, a forwarding secret, and directories for Proxy, Survival, and Creative. No JARs are downloaded or launched during setup.

1. Download compatible releases from [Velocity](https://papermc.io/downloads/velocity) and [Paper](https://papermc.io/downloads/paper).
2. Drop the proxy JAR into its Files page as `velocity.jar`, and the Paper JAR into each backend as `server.jar` (128 MiB per file; 160 MiB total request limit).
3. Select the required Java version in Settings. Set `JAVA_21_BIN`, `JAVA_25_BIN`, or `JAVA_17_BIN` if that version is not your default `java` executable. The panel checks the actual version before launching.
4. Read and accept the Minecraft EULA in each Paper server's Settings, then Start the servers.

The generated proxy and backends initially bind to loopback ports 25565–25567. Velocity uses modern forwarding, online-mode authentication, and a shared secret; Paper backends stay loopback-only with Velocity authentication enabled. To expose Minecraft itself, deliberately configure the proxy's `bind` in `velocity.toml` and your firewall. Do not expose backend ports.

## Runtime behavior

- Start, graceful Stop/Restart, real stdin commands, ANSI stdout/stderr, and capped crash recovery.
- Eligible servers autostart when the panel starts: a JAR must exist and Paper's EULA must already be accepted. No automatic JAR installation or updates.
- Settings and list ordering persist in `network/panel.json`. Managed ports/directories are read-only in the UI; change them and their corresponding server files only with the panel stopped.
- Files are read/written on disk, with traversal/symlink checks. Stop a server before changing its files. File editing is limited to 512 KiB text files.
- Backups are actual `.tar.gz` archives under `network/backups/<id>/`. The server must be stopped. Create/delete are supported; restore/download are not implemented yet.
- CPU/RAM come from Linux `/proc`, player counts from Minecraft status pings, and Paper TPS from the `tps` command every 15 seconds. Per-proxy network throughput is not implemented and is shown as unavailable, never synthetic.
- The browser refreshes server-rendered snapshots over the RSC transport every two seconds. Terminal rendering, dragging, and input are client interactions; authoritative state and mutations remain server-side.
- Logs/metric history are bounded and in memory; configurations, files, worlds, and backups persist. Graceful panel shutdown stops managed Java processes. A lock prevents two panels from managing the same network, and a PID registry blocks duplicate starts if Java survived an abrupt panel exit. After changing runtime code during development, restart the panel rather than relying on HMR.

## Access and configuration

The panel binds to `127.0.0.1` by default. Set an HTTP Basic password before remote access; username is `admin`:

```sh
PANEL_PASSWORD='choose-a-long-unique-password' pnpm dev
```

`PANEL_DATA_DIR` changes the network data directory. `JAVA_<version>_BIN` selects Java executables. If HTTPS is terminated at a reverse proxy, set `PANEL_ORIGIN` to the exact external origin (for example `https://panel.example.com`) for action origin validation. These are server process environment variables, not `VITE_*` browser variables.

Without a password, only loopback hostnames without proxy-forwarding headers are accepted. **Keep the listener loopback-only in this mode; host checks are not a replacement for authentication.** For remote use, require `PANEL_PASSWORD` and HTTPS at a trusted reverse proxy. Origin checks protect action dispatch against cross-origin requests. Use a dedicated unprivileged OS user: Java plugins and startup JVM arguments are trusted administrator code, not sandboxed by the file path checks.

Do not run multiple panel instances against one data directory. After an ungraceful crash, inspect any surviving PIDs before clearing `network/processes.json` or `.panel.lock`.

## Checks

```sh
pnpm test
pnpm lint
pnpm build
pnpm preview
```

Tests exercise process lifecycle with disposable Node child processes, not real Minecraft instances. A full Velocity/Paper launch still needs supplied JARs and compatible Java.
