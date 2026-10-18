package cc.arsn.panel.metrics;

import java.lang.instrument.Instrumentation;
import java.lang.management.ManagementFactory;
import java.lang.management.MemoryUsage;
import java.lang.reflect.Method;
import java.net.StandardProtocolFamily;
import java.net.UnixDomainSocketAddress;
import java.nio.ByteBuffer;
import java.nio.channels.SocketChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.locks.LockSupport;

/** Bootstrap-visible bridge: no commands, plugin registration, or player output. */
public final class Bridge {
    private static volatile Instrumentation instrumentation;
    private static volatile Class<?> bukkit;
    private static volatile Object proxy;
    private static volatile Map<String, Object> paper;
    private static volatile long paperAt;
    private static long lastTickSample;
    private static String socket, token, serverId, kind;
    private static long previousCpu = -1, previousTime;
    private static final Map<String, Method> readable = new ConcurrentHashMap<>();
    private static final AtomicLong upstreamIn = new AtomicLong(), upstreamOut = new AtomicLong();
    private static long lastIn, lastOut, lastAt;

    public static void configure(String file, Instrumentation api) throws Exception {
        Properties properties = new Properties();
        try (var reader = Files.newBufferedReader(Path.of(file), StandardCharsets.UTF_8)) { properties.load(reader); }
        socket = properties.getProperty("socket");
        token = properties.getProperty("token");
        serverId = properties.getProperty("serverId");
        kind = properties.getProperty("kind");
        if (socket == null || token == null || serverId == null) throw new IllegalArgumentException("Missing panel agent configuration");
        instrumentation = api;
        Thread sender = new Thread(Bridge::sendLoop, "smol-panel-metrics");
        sender.setDaemon(true);
        sender.setContextClassLoader(null);
        sender.start();
    }

    public static void bindProxy(Object value) { proxy = value; }

    /** Counts every decoded inbound Minecraft frame in the proxy pipeline. */
    public static void inboundFrames(List<?> frames) {
        for (Object frame : frames) upstreamIn.addAndGet(bytes(frame));
    }

    /** Counts one outbound Minecraft frame from the proxy pipeline. */
    public static void outboundFrame(Object frame) { upstreamOut.addAndGet(bytes(frame)); }

    private static long bytes(Object frame) {
        if (frame == null) return 0;
        try {
            String name = frame.getClass().getName();
            Method readableBytes = readable.get(name);
            if (readableBytes == null) {
                readableBytes = frame.getClass().getMethod("readableBytes");
                readable.put(name, readableBytes);
            }
            Object size = readableBytes.invoke(frame);
            return size instanceof Number number ? number.longValue() : 0;
        } catch (Throwable ignored) { /* Frames from unknown buffers stay unmeasured. */ }
        return 0;
    }

    /** Called after a Paper tick on its main thread. Bukkit world/player access stays here. */
    public static void tick() {
        long now = System.nanoTime();
        if (now - lastTickSample < 2_000_000_000L) return;
        lastTickSample = now;
        try {
            if (bukkit == null) {
                for (Class<?> type : instrumentation.getAllLoadedClasses()) {
                    if ("org.bukkit.Bukkit".equals(type.getName())) { bukkit = type; break; }
                }
            }
            if (bukkit == null) return;
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("tps", bukkit.getMethod("getTPS").invoke(null));
            result.put("mspt", bukkit.getMethod("getAverageTickTime").invoke(null));
            result.put("maxPlayers", bukkit.getMethod("getMaxPlayers").invoke(null));
            result.put("serverVersion", bukkit.getMethod("getVersion").invoke(null));
            try { result.put("minecraftVersion", bukkit.getMethod("getMinecraftVersion").invoke(null)); }
            catch (Exception ignored) { result.put("minecraftVersion", String.valueOf(bukkit.getMethod("getBukkitVersion").invoke(null)).split("-", 2)[0]); }
            Collection<?> online = (Collection<?>) bukkit.getMethod("getOnlinePlayers").invoke(null);
            result.put("onlinePlayers", online.size());
            List<Object> players = new ArrayList<>();
            for (Object player : online) {
                if (players.size() >= 200) break;
                Map<String, Object> info = new LinkedHashMap<>();
                info.put("name", call(player, "getName"));
                info.put("uuid", String.valueOf(call(player, "getUniqueId")));
                info.put("ping", call(player, "getPing"));
                players.add(info);
            }
            result.put("players", players);
            List<Object> worlds = new ArrayList<>();
            for (Object world : (List<?>) bukkit.getMethod("getWorlds").invoke(null)) {
                if (worlds.size() >= 32) break;
                Map<String, Object> info = new LinkedHashMap<>();
                info.put("name", call(world, "getName"));
                info.put("players", ((List<?>) call(world, "getPlayers")).size());
                info.put("entities", ((List<?>) call(world, "getEntities")).size());
                info.put("chunks", java.lang.reflect.Array.getLength(call(world, "getLoadedChunks")));
                worlds.add(info);
            }
            result.put("worlds", worlds);
            paper = result;
            paperAt = System.currentTimeMillis();
        } catch (Throwable ignored) { /* Version-specific API changes never interrupt a tick. */ }
    }

    private static Object call(Object target, String method) throws Exception {
        Method candidate = target.getClass().getMethod(method);
        return candidate.invoke(target);
    }

    private static void sendLoop() {
        while (true) {
            try { send(snapshot()); } catch (Throwable ignored) { /* Quietly retry when the panel is unavailable. */ }
            try { Thread.sleep(2000); } catch (InterruptedException ignored) { return; }
        }
    }

    private static Map<String, Object> snapshot() throws Exception {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("version", 1);
        result.put("serverId", serverId);
        result.put("token", token);
        result.put("pid", ProcessHandle.current().pid());
        MemoryUsage heap = ManagementFactory.getMemoryMXBean().getHeapMemoryUsage();
        result.put("heapUsed", heap.getUsed());
        result.put("heapMax", Math.max(0, heap.getMax()));
        result.put("heapCommitted", heap.getCommitted());
        result.put("uptime", ManagementFactory.getRuntimeMXBean().getUptime());
        result.put("threads", ManagementFactory.getThreadMXBean().getThreadCount());
        result.put("javaVersion", System.getProperty("java.version"));
        if (ManagementFactory.getOperatingSystemMXBean() instanceof com.sun.management.OperatingSystemMXBean os) {
            long cpu = os.getProcessCpuTime(), time = System.nanoTime();
            if (previousCpu >= 0 && time > previousTime) result.put("cpu", Math.max(0.0, (cpu - previousCpu) * 100.0 / (time - previousTime)));
            previousCpu = cpu; previousTime = time;
        }
        if ("paper".equals(kind)) {
            Map<String, Object> latest = paper;
            if (latest != null && System.currentTimeMillis() - paperAt < 6000) result.putAll(latest);
        } else if (proxy != null) {
            try { result.put("proxyVersion", call(call(proxy, "getVersion"), "getVersion")); }
            catch (Exception ignored) { }
            try { result.put("onlinePlayers", call(proxy, "getPlayerCount")); }
            catch (Exception ignored) { }
            result.put("proxyControl", true);
            List<Map<String, Object>> players = new ArrayList<>();
            try {
                for (Object player : (Collection<?>) call(proxy, "getAllPlayers")) {
                    if (players.size() >= 200) break;
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("name", call(player, "getUsername"));
                    item.put("uuid", String.valueOf(call(player, "getUniqueId")));
                    item.put("ping", Math.max(0, ((Number) call(player, "getPing")).longValue()));
                    java.util.Optional<?> current = (java.util.Optional<?>) call(player, "getCurrentServer");
                    if (current.isPresent()) item.put("serverId", call(call(current.get(), "getServerInfo"), "getName"));
                    players.add(item);
                }
                result.put("players", players);
            } catch (Exception ignored) { }
        }
        if (!"paper".equals(kind)) {
            // Proxy pipeline byte counters since the previous snapshot, reported as bytes/second.
            long in = upstreamIn.get(), out = upstreamOut.get(), now = System.currentTimeMillis();
            if (lastAt > 0 && now - lastAt >= 250) {
                result.put("networkIn", Math.max(0L, (in - lastIn) * 1000 / (now - lastAt)));
                result.put("networkOut", Math.max(0L, (out - lastOut) * 1000 / (now - lastAt)));
            }
            lastIn = in; lastOut = out; lastAt = now;
        }
        return result;
    }

    private static void send(Map<String, Object> value) throws Exception {
        byte[] bytes = (json(value) + "\n").getBytes(StandardCharsets.UTF_8);
        if (bytes.length > 65536) return;
        try (SocketChannel channel = SocketChannel.open(StandardProtocolFamily.UNIX)) {
            channel.configureBlocking(false);
            long deadline = System.nanoTime() + 250_000_000L;
            channel.connect(UnixDomainSocketAddress.of(socket));
            while (!channel.finishConnect()) {
                if (System.nanoTime() > deadline) return;
                LockSupport.parkNanos(1_000_000L);
            }
            ByteBuffer buffer = ByteBuffer.wrap(bytes);
            while (buffer.hasRemaining()) {
                if (System.nanoTime() > deadline) return;
                if (channel.write(buffer) == 0) LockSupport.parkNanos(1_000_000L);
            }
            if (proxy != null) {
                ByteBuffer response = ByteBuffer.allocate(4096);
                while (System.nanoTime() < deadline && response.hasRemaining()) {
                    int read = channel.read(response);
                    if (read < 0) break;
                    if (read == 0) LockSupport.parkNanos(1_000_000L);
                }
                response.flip();
                String commands = StandardCharsets.UTF_8.decode(response).toString();
                for (String line : commands.split("\n")) {
                    if (!line.matches("kick [a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}")) continue;
                    try {
                        java.util.UUID uuid = java.util.UUID.fromString(line.substring(5));
                        java.util.Optional<?> target = (java.util.Optional<?>) proxy.getClass().getMethod("getPlayer", java.util.UUID.class).invoke(proxy, uuid);
                        if (target.isEmpty()) continue;
                        Class<?> component = Class.forName("net.kyori.adventure.text.Component", true, proxy.getClass().getClassLoader());
                        Object reason = component.getMethod("text", String.class).invoke(null, "Disconnected by network administrator");
                        target.get().getClass().getMethod("disconnect", component).invoke(target.get(), reason);
                    } catch (Exception ignored) { }
                }
            }
        }
    }

    private static String json(Object value) {
        if (value == null) return "null";
        if (value instanceof Number number) return Double.isFinite(number.doubleValue()) ? number.toString() : "null";
        if (value instanceof Boolean) return value.toString();
        if (value instanceof double[] numbers) { List<Double> items = new ArrayList<>(); for (double number : numbers) items.add(number); return json(items); }
        if (value instanceof Map<?, ?> map) {
            List<String> entries = new ArrayList<>();
            map.forEach((key, item) -> entries.add(json(String.valueOf(key)) + ":" + json(item)));
            return "{" + String.join(",", entries) + "}";
        }
        if (value instanceof Collection<?> items) { List<String> values = new ArrayList<>(); for (Object item : items) values.add(json(item)); return "[" + String.join(",", values) + "]"; }
        StringBuilder escaped = new StringBuilder("\"");
        for (char character : String.valueOf(value).toCharArray()) {
            if (character == '"' || character == '\\') escaped.append('\\').append(character);
            else if (character < 32) escaped.append(String.format("\\u%04x", (int) character));
            else escaped.append(character);
        }
        return escaped.append('"').toString();
    }
}
