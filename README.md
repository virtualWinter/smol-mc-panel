# smol mc panel

A single-network Minecraft panel: one Velocity proxy and explicitly configured Paper backends, managed as local Java processes. React Server Components and Server Functions handle all server operations; there is no standalone REST API.

## Run

Requires Node.js 22.18+, pnpm, and `tar` (for backups). Linux provides CPU/RAM metrics and automatic Java installation.

```sh
pnpm install
pnpm dev
```

Open the panel locally to complete first-start setup: create the admin username/password and define your Paper servers. The editable server list starts with a suggested Lobby; add, edit, or remove rows before confirming. Each server has an explicit name, ID, loopback port, memory limit, and Java version. Setup creates the confirmed proxy/server directories and forwarding configuration, wires the chosen backends into the proxy, and signs the admin in. At least one backend is required; no unselected sample servers, JAR downloads, EULA acceptance, or Java processes are created automatically. Subsequent visits require sign-in. Existing networks are preserved when adding their first admin account; account-only setup does not add or change their servers.

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

1. Complete setup and confirm the backend servers you want. Setup writes them to `data/panel.json` and configures proxy routing automatically. `panel.json` is the authoritative backend list: whenever the panel boots, it reconciles `velocity.toml` with that list, so editing `data/panel.json` (panel stopped, restart afterwards) is all a topology change needs. The panel does not discover or invent servers.
2. Use **Reinstall** for Velocity or Paper, or drop compatible official JARs into Files: `velocity.jar` or `server.jar` (128 MiB per file; 160 MiB total request limit).
3. Select the required Java version in Settings. The panel automatically downloads Eclipse Temurin into `data/java/java-17`, `data/java/java-21`, or `data/java/java-25` when reinstalling or starting a server, then launches that exact binary. Existing verified panel-managed installations are reused; system Java and `JAVA_*_BIN` variables are not used. Reinstall uses saved settings, so save a changed Java version first.
4. Read and accept the Minecraft EULA in each Paper server's Settings, then Start the servers.

The initial proxy binds `0.0.0.0:25565` so game traffic can be published directly; explicitly configured backend ports stay loopback-only. Velocity uses modern forwarding, online-mode authentication, and a shared secret. Proxy configuration files are generated only when missing. On every panel boot the backend list (`[servers]`, `try`, and `[forced-hosts]` targets) is reconciled with `panel.json`, which rewrites the TOML when the list changes; all other settings and comments in that file are left to the user. When upgrading an older network whose `panel.json` still had a loopback proxy, the panel migrates it to `0.0.0.0` and rewrites only the `bind` line in the proxy's config file. Backend configurations are generated only when missing, never overwritten. Do not expose backend ports.

Velocity configs include an explicit empty `[forced-hosts]` table so Velocity does not fill in example host mappings. Any configured forced-host targets must reference real `[servers]` entries. The panel validates proxy routing before launch and disables crash retries when a proxy reports a fatal configuration error.

## Runtime behavior

- Start, graceful Stop/Restart, real stdin commands, ANSI stdout/stderr, and capped crash recovery.
- Missing Java versions are downloaded by the panel from Adoptium on Linux x64/arm64. Archive size, SHA-256, extraction paths/links, and the actual Java executable version are verified before the final `java-<version>` directory is installed. Downloads show live progress; servers sharing a version share one installation/download. Existing Java directories are never overwritten silently. Other platforms are not supported yet.
- Before installing Java or starting a server, the panel inspects the JAR's manifest entry-point class version. If necessary, it upgrades the saved Java selection to the smallest supported compatible version and downloads it automatically (for example class version 69 requires Java 25). Optional multi-release classes and compiler build metadata do not force upgrades. Compatibility failures that still occur at startup disable crash recovery instead of repeating the same failed launch. Bundled/nested server JARs or plugin requirements may still require selecting a newer Java manually.
- Eligible servers autostart when the panel starts: a JAR must exist and Paper's EULA must already be accepted. No automatic JAR installation or updates.
- **Reinstall** requires a stopped server and replaces only the configured JAR. The first download selects the latest stable PaperMC build (confirm version/Java compatibility and back up worlds first); later reinstalls redownload that exact recorded build. Downloads are host-restricted, size-bounded, and atomically swapped after verification with PaperMC's SHA-256. Worlds, plugins, configs, EULA, and backups are untouched; the server is not started automatically.
- Settings and list ordering persist in `data/panel.json`. Managed ports/directories are read-only in the UI; change them and their corresponding server files only with the panel stopped.
- Files, plugins, and configs stay editable (save, upload, move) while the server runs; changes pick up on its next start or plugin reload. Backups, reinstalls, settings, EULA, and power actions still require a stopped, idle server since they replace live state. All file access is on disk, with traversal/symlink checks; file editing is limited to 512 KiB text files.
- Backups are actual `.tar.gz` archives under `data/backups/<id>/`. The server must be stopped. Create/delete are supported; restore/download are not implemented yet.
- Metrics come from an internal Java agent (`agent/src/cc/arsn/panel/metrics/`), attached automatically as `-javaagent` when a server starts. It is not a Bukkit or Velocity plugin: it registers no commands, appears in no plugin lists, and never writes to the console or chat. It intercepts Paper tick loops and proxy constructors, and pushes TPS/MSPT, versions, player lists/pings, world player/entity/chunk counts, plus JVM heap, CPU, uptime, and thread stats every two seconds to the panel over a local Unix domain socket (`data/metrics.sock`, mode 0600) with per-server tokens and PID checks; foreign or unrelated processes are refused. Falls back to `/proc` CPU and status pings where the agent cannot provide data. CPU/RAM basics come from Linux `/proc`; the proxy also reports inbound/outbound Minecraft throughput (bytes per second) measured on its netty frame seams.
- The browser refreshes server-rendered snapshots over the RSC transport every second, independently of long-running actions. Reinstalls show server-reported bytes, percentage, average speed, verification, and completion/error state, including after reload. Terminal rendering, dragging, and input are client interactions; authoritative state and mutations remain server-side.
- Setup/login forms are not background-refreshed while entering credentials. Interrupted server connections keep the existing UI and show a readable recovery notice; HTTP errors are rejected before React attempts to decode them as RSC.
- Logs/metric history are bounded and in memory; configurations, files, worlds, and backups persist. Graceful panel shutdown stops managed Java processes. A lock prevents two panels from managing the same network, and a PID registry blocks duplicate starts if Java survived an abrupt panel exit. After changing runtime code during development, restart the panel rather than relying on HMR.

A step further down the same spirit: the agent JAR is compiled by the panel with the managed JDK (`javac`/`jar`) into `data/agents/`, sunsetting its private ASM copy under `cc.arsn.panel.metrics.internal.asm` (pinned download, SHA-256 verified) so it can never shadow the server's own ASM. If the agent cannot build or instrument a server version, the panel continues to run that server with `/proc`-based metrics only, and no restart loops or fatal errors are introduced. The data directory path must not contain `=` (separator in the `-javaagent` argument).

## Docker

The image builds the panel bundle and ships it with the compiled server runtime. The panel downloads and manages its own JDKs inside the persistent volume, so the image itself contains no Java. Volumes hold `data/`, the panel-admin account, panel configuration, servers, downloaded JDKs, and backups.

```sh
docker compose up -d --build
```

Open `http://127.0.0.1:5173/` (host port mapped by compose) and complete first-start setup. Data persists in the named `panel-data` volume. Stop the panel with `docker compose down` (or `docker compose stop`); the configured stop timeout outlasts Minecraft's graceful shutdown, and managed Java processes are stopped on panel shutdown. The image runs an unprivileged user (`node`, UID 1000); bind-mounted host directories must be chowned to that UID, and named volumes get it automatically.

- Panel web access is published on 5173. Behind a reverse proxy that rewrites the Host header, set `PANEL_ORIGIN` to the exact external origin, or Server Function origin validation fails.
- With `PANEL_ORIGIN` set to an HTTPS origin, first-start setup is also acceptable through that proxy: requests must arrive with the declared Host and `x-forwarded-proto: https`. Complete setup immediately after the first deployment — before the account exists, whoever loads the panel first can create the admin. Without a declared origin, setup stays loopback-only.
- Exposing Minecraft: the proxy's managed listener binds `0.0.0.0:25565` (encoded in `panel.json`), so publishing game traffic is a compose `ports` mapping. Since Docker cannot forward to a loopback listener, do not change the proxy bind back to loopback; if `network_mode: host` is preferred, remove the port mapping instead. Backend Paper servers must stay loopback-only. Behind an existing Traefik, routing the game traffic through it is also supported: give Traefik a `minecraft` TCP entrypoint on `:25565` and a file-provider router that forwards to the panel container's port 25565 (see the Dokploy section below for the exact configuration).
- The metrics agent compiles on first server start from `agent/` sources shipped in the image, using the JDK the panel installed under `/data/java/`.
- The container needs enough RAM for the panel plus every configured server's `maxMemory` at once; sized images should match the network currently hosted.
- Restore-from-volume backups are unaffected by upgrades; update the image with `docker compose pull && docker compose up -d --build`. RSC/dataset formats and `data/` layout migrations run automatically on first start as described below.
- The agent JAR is compiled by the panel with the managed JDK (`javac`/`jar`) into `/data/agents/`, sunsetting its private ASM copy under `cc.arsn.panel.metrics.internal.asm` (pinned download, SHA-256 verified) so it can never shadow the server's own ASM. If the agent cannot build or instrument a server version, the panel continues to run that server with `/proc`-based metrics only, and no restart loops or fatal errors are introduced. The data directory path must not contain `=` (separator in the `-javaagent` argument).

## Backups, plugins, and players

The plugin catalog fills Minecraft version automatically from the Java agent, and caches the last detected version for stopped servers. Live detection is authoritative; offline servers allow a manual version override for upgrades. A server that has never run can use manual input until its first telemetry report.

Opening Plugins automatically browses popular projects (by downloads) from the selected catalog, filtered for Paper or Velocity. Switch catalogs to browse its list, enter a query to search, or submit an empty search to return to popular plugins. Browsing never installs anything automatically; release compatibility is checked when choosing a version.

- **Backups:** manual backups and restores require a stopped server. Daily schedules are opt-in, use UTC, and stop/restart a running server for a consistent archive. A missed schedule runs once after the panel becomes available. A failed attempt is shown in Backups; it is not retried repeatedly that day. Retention (1–100 backups) runs only after a successful scheduled backup and includes manual backups. Scheduling is disabled by default.
- **S3:** the compose service reads the optional, server-local `/etc/dokploy/smol-mc-panel/s3.env` (override with `PANEL_S3_ENV_FILE`). This is under Dokploy's mounted configuration directory so its Compose process can read it. Use Compose v2.24+ for optional env files. Configure `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PREFIX=backups/`, and `S3_FORCE_PATH_STYLE=true`. Use a private bucket and a restricted key. Credentials never enter browser state. Completed archives are uploaded with multipart support; local copies are removed only after confirmed upload/listing. Failed uploads stay local. Without S3 configuration backups stay local. **Refresh storage** reloads remote backups. Retention and deletion only target UUID-named archives under this panel's configured prefix and server ID. Give separate panels distinct prefixes.
- **Restore:** downloads into staging, rejects links/devices/traversal and archives exceeding 100 GiB of declared file content, then swaps directories. The previous directory remains beside the server as `*.before-restore-<uuid>` for recovery; it is not automatically deleted. The server stays stopped. Restored global player rules are reconciled on the next start. Ensure enough space for the archive, staging, and original world.
- **Plugins:** both Paper and Velocity have a **Plugins** tab for Modrinth and Hangar. Search, release validation, dependencies, and downloads use the server's actual platform. Paper releases are filtered by Minecraft version; Hangar Velocity releases use the detected/cached Velocity version instead. Modrinth Velocity releases are filtered by the Velocity loader, without pretending the proxy version is a Minecraft version. Stable, checksum-verified JARs are downloaded from the catalogs' own CDNs. Hangar projects with external downloads are not automatically installed; use Files for those. Required dependencies are listed, not automatically installed. Check updates from the installed list and select a release explicitly. Install/remove is allowed while running but applies on restart; plugin config files are retained. Modified JARs are not overwritten. Only panel-installed JARs are tracked; manually uploaded JARs stay in Files. Plugins execute arbitrary Java code: trust their authors and back up before updating.
- **Players:** **Network → Players** shows live proxy/backend telemetry and offers global kick, ban/unban, and whitelist controls. Kicks disconnect at Velocity, not just the current backend. Bans and whitelist entries persist centrally and sync to offline/new Paper backends before launch. Unrelated local rules are preserved; explicit unban/removal also clears that player's local rule. Whitelist mode is untouched until explicitly configured in the panel. UUIDs come from authenticated telemetry or Minecraft profile lookup. These controls do not provide permissions/OP management. Network kicks require the current internal agent (restart Velocity after an agent update); the existing authenticated Unix socket accepts only bounded, process-bound UUID disconnect messages, not arbitrary remote commands.

## Dokploy deployment

After setup, use **Network → Manage servers** to create or unregister Paper backends. Stop Velocity first so routing changes take effect on its next start; the backend being removed must also be stopped. Removal always preserves its directory and backups, and preserved directories cannot be reused accidentally. New backends are provisioned without downloading a JAR or accepting the EULA. At least one backend must remain.

Deploy as a Dokploy **Docker Compose** service using this repository's `docker-compose.yml`; Dokploy's Traefik terminates TLS and routes to the panel. Set the service domain in Dokploy and configure the panel env so both layers agree:

```text
PANEL_ORIGIN=https://panel.example.com
```

`panel.example.com` must be the exact scheme/host TLS clients use; server-function origin validation and pre-setup access both compare against it. Dokploy's Traefik already forwards the original Host and `x-forwarded-proto: https`, which are required. Open the public domain right after the first deployment and complete first-start setup in the browser (admin account, proxy type, Paper backends) — do this immediately, since setup is first-come-first-served until an account exists.

Operating notes:

- Keep the container as-is: Traefik reaches it over Dokploy's internal network, and the binding inside the container is `0.0.0.0:5173` for the web panel plus loopback-only Minecraft listeners.
- Panel access goes through Traefik. The `5173:5173` mapping in the compose file is optional on a Dokploy server; keeping it publishes the panel on the host IP over plain HTTP, which breaks the Secure session cookie sent under `PANEL_ORIGIN` — remove the mapping unless you tunnel through SSH (`ssh -L 5173:127.0.0.1:5173 <host>`).
- To expose Minecraft, the game traffic goes through Traefik's TCP routing: a `minecraft` entrypoint on `:25565` in Traefik's static config (`/etc/dokploy/traefik/traefik.yml`, add under `entryPoints:`):
  ```yaml
    minecraft:
      address: :25565
  ```
  plus a watched file-provider router (`/etc/dokploy/traefik/dynamic/minecraft.yml`):
  ```yaml
  tcp:
    routers:
      minecraft:
        entryPoints:
          - minecraft
        rule: HostSNI(`*`)
        service: minecraft-proxy
    services:
      minecraft-proxy:
        loadBalancer:
          servers:
            - address: "smol-mc-panel:25565"
  ```
  Publishing the entrypoint requires Traefik to be (re)created with `-p 25565:25565` (plain `docker restart` cannot add a port mapping). Players connect to the domain's port 25565 (e.g. `panel.example.com:25565`); Traefik forwards raw TCP to the proxy inside the container — no double publish of `25565:25565` in the panel's compose `ports`. Without this wiring (or on a plain Docker host), fall back to publishing the port directly as described above.
- Player IPs behind Traefik: a TCP reverse proxy replaces the client socket, so the proxy would otherwise only see Traefik's address. Traefik sends HAProxy PROXY protocol v2 headers (`serversTransports`: `proxyProtocol: version: 2` on the TCP service) and Velocity learns each player's real IP when `velocity.toml` has `[advanced] haproxy-protocol = true`. Modern IP forwarding then carries that real IP into every Paper backend. Velocity 4.x ignores different PROXY-protocol key names — use exactly `haproxy-protocol`. Direct connections not carrying a PROXY header are then rejected by Velocity, so the entrypoint must only be reachable through whatever proxy ingress supports it. Restart the proxy after flipping the flag.
- `x-forwarded-proto` must be `https` (default Dokploy behaviour) — connections to the declared host over plain HTTP fail validation now and forever (also enforced for server-function POSTs by the origin match).

## Access and configuration

The panel binds to `127.0.0.1` by default. First-account setup requires direct local access, or a reverse proxy whose external HTTPS origin was configured in `PANEL_ORIGIN` before setup (see Docker/Dokploy above). Admin passwords are salted with scrypt and stored only as hashes in `data/admin.json` (mode 0600). Signed, HttpOnly, SameSite=Strict cookies keep sessions for seven days; HTTPS deployments also use Secure cookies. All management Server Functions enforce authentication, not just the page UI. Sign out from the network overview. `PANEL_PASSWORD`/HTTP Basic authentication is no longer used.

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
