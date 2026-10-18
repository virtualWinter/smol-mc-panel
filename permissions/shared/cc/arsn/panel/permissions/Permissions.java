package cc.arsn.panel.permissions;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** The permission snapshot the panel hosts and pushes to this server.
 *
 * The panel is authoritative: it sends the serialized snapshot over a Unix socket and the
 * plugin applies it. The cache file (`plugins/smol-panel/permissions.txt`) is only a
 * fallback for when the panel is unreachable at startup; it is refreshed whenever a
 * snapshot arrives. */
public final class Permissions {

  public static final String FILE = "plugins/smol-panel/permissions.txt";
  private static final long POLL_MS = 5000L;

  private final Path file = Paths.get(FILE);
  private volatile Map<String, List<Node>> subjects = Collections.emptyMap();
  private volatile String raw = "";
  private volatile Runnable onChange;
  private Thread watcher;

  public static final class Node {
    public final String name;
    public final boolean value;
    Node(String name, boolean value) { this.name = name; this.value = value; }
  }

  public Permissions() {}

  /** Wires the callback invoked (on whatever thread) when the snapshot changes. */
  public void onChange(Runnable callback) { this.onChange = callback; }

  /** Starts the fallback file poller. The socket channel provides instant updates. */
  public void start() {
    Thread thread = new Thread(() -> {
      while (!Thread.currentThread().isInterrupted()) {
        try { Thread.sleep(POLL_MS); } catch (InterruptedException stopped) { return; }
        try { refresh(false); } catch (RuntimeException ignored) { /* retried next tick */ }
      }
    }, "smol-panel-permissions");
    thread.setDaemon(true);
    thread.start();
    this.watcher = thread;
  }

  public void stop() { Thread thread = this.watcher; if (thread != null) thread.interrupt(); }

  /** Rebuilds the snapshot from text. Returns true when it actually changed. */
  public synchronized boolean update(String text) {
    if (text == null) text = "";
    if (text.equals(this.raw)) return false;
    this.raw = text;
    this.subjects = parse(text);
    Runnable callback = this.onChange;
    if (callback != null) callback.run();
    return true;
  }

  /** Reads the cache file on startup. */
  public synchronized boolean loadCache() { return refresh(true); }

  /** Reads the cache file and rebuilds. Returns true when it changed. */
  public synchronized boolean refresh(boolean force) {
    try {
      String text = Files.isRegularFile(this.file) ? Files.readString(this.file, StandardCharsets.UTF_8) : "";
      return update(text);
    } catch (IOException | RuntimeException error) { return false; }
  }

  /** Writes a received snapshot to the cache file. */
  public void cache(String text) {
    try {
      Files.createDirectories(this.file.getParent());
      Files.writeString(this.file, text, StandardCharsets.UTF_8);
    } catch (IOException ignored) { /* best effort */ }
  }

  static Map<String, List<Node>> parse(String text) {
    List<String> lines = Arrays.asList(text.split("\\r?\\n", -1));
    return parse(lines);
  }

  static Map<String, List<Node>> parse(List<String> lines) {
    Map<String, List<Node>> parsed = new HashMap<>();
    for (String raw : lines) {
      String text = raw.trim();
      if (text.isEmpty() || text.startsWith("#")) continue;
      String[] parts = text.split(" ");
      boolean user = parts[0].equals("u");
      if (user && parts.length < 2) continue;
      int start = user ? 2 : 1;
      List<Node> nodes = new ArrayList<>();
      for (int index = start; index < parts.length; index++) {
        String token = parts[index];
        int split = token.indexOf('=');
        if (split <= 0 || split >= token.length() - 1) continue;
        nodes.add(new Node(token.substring(0, split).toLowerCase(Locale.ROOT), token.charAt(split + 1) == '1'));
      }
      if (nodes.isEmpty()) continue;
      parsed.put(user ? parts[1].toLowerCase(Locale.ROOT) : "d", Collections.unmodifiableList(nodes));
    }
    return parsed;
  }

  public List<Node> nodes(String subject) {
    Map<String, List<Node>> snapshot = this.subjects;
    List<Node> found = subject == null ? null : snapshot.get(subject.toLowerCase(Locale.ROOT));
    if (found == null) found = snapshot.get("d");
    return found == null ? Collections.emptyList() : found;
  }

  public Boolean value(String subject, String permission) {
    if (permission == null) return null;
    String query = permission.toLowerCase(Locale.ROOT);
    for (Node node : nodes(subject)) if (matches(node.name, query)) return node.value;
    return null;
  }

  public Map<String, Boolean> attachable(String subject, Iterable<String> registered) {
    Map<String, Boolean> values = new LinkedHashMap<>();
    for (Node node : nodes(subject)) values.putIfAbsent(node.name, node.value);
    for (String name : registered) {
      if (name == null) continue;
      Boolean resolved = value(subject, name);
      if (resolved != null) values.put(name.toLowerCase(Locale.ROOT), resolved);
    }
    return values;
  }

  static boolean matches(String node, String query) {
    if (node.equals(query)) return true;
    if (node.equals("*")) return true;
    if (node.endsWith(".*")) return query.startsWith(node.substring(0, node.length() - 1));
    return false;
  }
}
