# smol mc panel

A single-network Minecraft panel: one Velocity or BungeeCord proxy and explicitly configured Paper backends, managed as local Java processes. React Server Components and Server Functions handle all server operations; there is no standalone REST API.

## Run

Requires Node.js 22.18+, pnpm, and `tar` (for backups). Linux provides CPU/RAM metrics and automatic Java installation.

```sh
pnpm install
pnpm dev
```

Open the panel locally to complete first-start setup: create the admin username/password, select Velocity or BungeeCord, and define your Paper servers. The editable server list starts with a suggested Lobby; add, edit, or remove rows before confirming. Each server has an explicit name, ID, loopback port, memory limit, and Java version. Setup creates the confirmed proxy/server directories and forwarding configuration, wires the chosen backends into the proxy, and signs the admin in. At least one backend is required; no unselected sample servers, JAR downloads, EULA acceptance, or Java processes are created automatically. Subsequent visits require sign-in. Existing networks are preserved when adding their first admin account; account-only setup does not add or change their servers.

```text
data/
  admin.json
  panel.json
  servers/<server-id>/
  java/java-<version>/
  backups/<server-id>/
  installations/<server-id>.json
```

On restart, the old `network/` directory is migrated to `data/` if the destination does not exist. Legacy top-level `java-<version>` directories move under `data/java/`. Migration refuses live process locks or conflicting destinations; no existing files are overwritten. Stop the old panel and its managed servers before restarting with the new layout.

1. Complete setup, choose your proxy, and confirm the backend servers you want. Setup writes them to `data/panel.json` and configures proxy routing automatically. Later server-list changes currently require explicitly editing `data/panel.json` and the proxy's backend list while the panel is stopped; the panel does not discover or invent servers.
2. Use **Reinstall** for Velocity, BungeeCord, or Paper, or drop compatible official JARs into Files: `velocity.jar`, `bungeecord.jar`, or `server.jar` (128 MiB per file; 160 MiB total request limit).
3. Select the required Java version in Settings. The panel automatically downloads Eclipse Temurin into `data/java/java-17`, `data/java/java-21`, or `data/java/java-25` when reinstalling or starting a server, then launches that exact binary. Existing verified panel-managed installations are reused; system Java and `JAVA_*_BIN` variables are not used. Reinstall uses saved settings, so save a changed Java version first.
4. Read and accept the Minecraft EULA in each Paper server's Settings, then Start the servers.

The initial proxy binds to loopback port 25565; explicitly configured backend ports must also be loopback-only. Velocity uses modern forwarding, online-mode authentication, and a shared secret. BungeeCord uses online-mode and IP forwarding, with matching Paper/Spigot forwarding settings. Proxy configurations are generated only when missing, never overwritten; update their backend lists when changing the network. To expose Minecraft itself, deliberately configure the proxy listener and your firewall. Do not expose backend ports.

BungeeCord cannot start with an empty `servers` map. Define a real backend in `data/servers/proxy/config.yml` and add its name to the listener's `priorities` list. The panel validates these before launching Java and shows a configuration warning instead of allowing a doomed startup. This does not create or launch a backend. Ctrl+C in the console clears input; use **Stop** to stop the managed process (with termination after a graceful-shutdown timeout if necessary).

Velocity configs include an explicit empty `[forced-hosts]` table so Velocity does not fill in example host mappings. Any configured forced-host targets must reference real `[servers]` entries. The panel validates proxy routing before launch and disables crash retries when a proxy reports a fatal configuration error.

## Runtime behavior

- Start, graceful Stop/Restart, real stdin commands, ANSI stdout/stderr, and capped crash recovery.
- Missing Java versions are downloaded by the panel from Adoptium on Linux x64/arm64. Archive size, SHA-256, extraction paths/links, and the actual Java executable version are verified before the final `java-<version>` directory is installed. Downloads show live progress; servers sharing a version share one installation/download. Existing Java directories are never overwritten silently. Other platforms are not supported yet.
- Before installing Java or starting a server, the panel inspects the JAR's manifest entry-point class version. If necessary, it upgrades the saved Java selection to the smallest supported compatible version and downloads it automatically (for example class version 69 requires Java 25). Optional multi-release classes and compiler build metadata do not force upgrades. Compatibility failures that still occur at startup disable crash recovery instead of repeating the same failed launch. Bundled/nested server JARs or plugin requirements may still require selecting a newer Java manually.
- Eligible servers autostart when the panel starts: a JAR must exist and Paper's EULA must already be accepted. No automatic JAR installation or updates.
- **Reinstall** requires a stopped server and replaces only the configured JAR. The first download selects the latest stable PaperMC build or BungeeCord's latest successful official Jenkins build (confirm version/Java compatibility and back up worlds first); later reinstalls redownload that exact recorded build. Downloads are host-restricted, size-bounded, and atomically swapped after verification. PaperMC supplies SHA-256; BungeeCord uses Jenkins' archived-artifact fingerprint endpoint, not the build's Maven fingerprint (which can describe the pre-shaded JAR). The archive's MD5 is verified over HTTPS before recording a local SHA-256 pin for all subsequent reinstalls. MD5 is an integrity check, not a modern cryptographic authenticity guarantee. Worlds, plugins, configs, EULA, and backups are untouched; the server is not started automatically.
- Settings and list ordering persist in `data/panel.json`. Managed ports/directories are read-only in the UI; change them and their corresponding server files only with the panel stopped.
- Files are read/written on disk, with traversal/symlink checks. Stop a server before changing its files. File editing is limited to 512 KiB text files.
- Backups are actual `.tar.gz` archives under `data/backups/<id>/`. The server must be stopped. Create/delete are supported; restore/download are not implemented yet.
- CPU/RAM come from Linux `/proc`, player counts from Minecraft status pings, and Paper TPS from the `tps` command every 15 seconds. Per-proxy network throughput is not implemented and is shown as unavailable, never synthetic.
- The browser refreshes server-rendered snapshots over the RSC transport every second, independently of long-running actions. Reinstalls show server-reported bytes, percentage, average speed, verification, and completion/error state, including after reload. Terminal rendering, dragging, and input are client interactions; authoritative state and mutations remain server-side.
- Setup/login forms are not background-refreshed while entering credentials. Interrupted server connections keep the existing UI and show a readable recovery notice; HTTP errors are rejected before React attempts to decode them as RSC.
- Logs/metric history are bounded and in memory; configurations, files, worlds, and backups persist. Graceful panel shutdown stops managed Java processes. A lock prevents two panels from managing the same network, and a PID registry blocks duplicate starts if Java survived an abrupt panel exit. After changing runtime code during development, restart the panel rather than relying on HMR.

## Access and configuration

The panel binds to `127.0.0.1` by default. First-account setup requires direct local access. Admin passwords are salted with scrypt and stored only as hashes in `data/admin.json` (mode 0600). Signed, HttpOnly, SameSite=Strict cookies keep sessions for seven days; HTTPS deployments also use Secure cookies. All management Server Functions enforce authentication, not just the page UI. Sign out from the network overview. `PANEL_PASSWORD`/HTTP Basic authentication is no longer used.

`PANEL_DATA_DIR` overrides the default `./data` directory; its `servers/` and `java/` layout stays the same. If HTTPS is terminated at a reverse proxy, set `PANEL_ORIGIN` to the exact external origin (for example `https://panel.example.com`) for action origin validation. These are server process environment variables, not `VITE_*` browser variables.

PaperMC downloads identify the panel as `smol-mc-panel/0.0.0 (https://arsn.cc; admin@arsn.cc)`. Override this if needed:

```sh
PAPERMC_USER_AGENT='smol-mc-panel/0.0.0 (https://arsn.cc; admin@arsn.cc)' pnpm dev
```

Before setup, only loopback hostnames without proxy-forwarding headers are accepted; keep the listener loopback-only until setup is complete. After setup, a login page protects the panel and server-side checks protect every management operation. Use HTTPS at a trusted reverse proxy for remote access. Origin checks protect action dispatch against cross-origin requests; repeated failed logins are rate-limited. Use a dedicated unprivileged OS user: Java plugins and startup JVM arguments are trusted administrator code, not sandboxed by file path checks. Keep `admin.json` and its session-signing secret private; account recovery is not implemented yet.

Do not run multiple panel instances against one data directory. After an ungraceful crash, inspect any surviving PIDs before clearing `data/processes.json` or `.panel.lock`.

## Checks

```sh
pnpm test
pnpm lint
pnpm build
pnpm preview
```

Tests exercise process lifecycle with disposable Node child processes, not real Minecraft instances. A full Velocity/Paper launch still needs supplied JARs and compatible Java.
