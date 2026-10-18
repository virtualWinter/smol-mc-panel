package cc.arsn.panel.permissions;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * The permission snapshot the panel writes next to this plugin.
 *
 * The panel owns every rule (groups, weights, inheritance); this class only walks an
 * already priority-ordered node list and reloads the file when it changes. Everything
 * here is plain JDK so the same class compiles for Paper and Velocity.
 */
public final class Permissions {

  /** Relative to the server working directory, which is also the plugin data folder. */
  public static final String FILE = "plugins/smol-panel/permissions.txt";

  private static final String DEFAULT_KEY = "d";
  private static final long POLL_MS = 5000L;

  private final Path file = Paths.get(FILE);
  private volatile Map<String, List<Node>> subjects = Collections.emptyMap();
  private volatile List<String> raw = Collections.emptyList();
  private Thread watcher;

  /** One resolved node. `name` may be `*` or end in `.*`. */
  public static final class Node {
    public final String name;
    public final boolean value;

    Node(String name, boolean value) {
      this.name = name;
      this.value = value;
    }
  }

  public void start() {
    refresh(true);
    Thread thread = new Thread(() -> {
      while (!Thread.currentThread().isInterrupted()) {
        try {
          Thread.sleep(POLL_MS);
        } catch (InterruptedException stopped) {
          return;
        }
        try {
          refresh(false);
        } catch (RuntimeException ignored) {
          // A partially written snapshot is retried on the next tick.
        }
      }
    }, "smol-panel-permissions");
    thread.setDaemon(true);
    thread.start();
    this.watcher = thread;
  }

  public void stop() {
    Thread thread = this.watcher;
    if (thread != null) thread.interrupt();
  }

  /** Reloads when the panel rewrites the file. Returns true when the snapshot changed.
   *
   * The file is tiny, so it is compared by content: that avoids depending on filesystem
   * timestamp resolution when two edits land in the same second. */
  public synchronized boolean refresh(boolean force) {
    try {
      List<String> lines = Files.isRegularFile(this.file)
          ? Files.readAllLines(this.file, StandardCharsets.UTF_8)
          : Collections.<String>emptyList();
      if (!force && lines.equals(this.raw)) return false;
      this.raw = lines;
      this.subjects = parse(lines);
      return true;
    } catch (IOException | RuntimeException error) {
      return false;
    }
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
      parsed.put(user ? parts[1].toLowerCase(Locale.ROOT) : DEFAULT_KEY, Collections.unmodifiableList(nodes));
    }
    return parsed;
  }

  /** The ordered nodes for one subject, defaulting to the `d` line for unknown subjects. */
  public List<Node> nodes(String subject) {
    Map<String, List<Node>> snapshot = this.subjects;
    List<Node> found = subject == null ? null : snapshot.get(subject.toLowerCase(Locale.ROOT));
    if (found == null) found = snapshot.get(DEFAULT_KEY);
    return found == null ? Collections.emptyList() : found;
  }

  /** The resolved value for a node, or null when nothing matches (the server default applies). */
  public Boolean value(String subject, String permission) {
    if (permission == null) return null;
    String query = permission.toLowerCase(Locale.ROOT);
    for (Node node : nodes(subject)) {
      if (matches(node.name, query)) return node.value;
    }
    return null;
  }

  /** The full map of node values to hand to a permission attachment.
   *
   * Attachments answer by exact name, so wildcard entries are expanded against the node
   * names a plugin registered; every subject node is included as well so unknown nodes
   * still resolve wherever the platform honours them. */
  public Map<String, Boolean> attachable(String subject, Iterable<String> registered) {
    Map<String, Boolean> values = new LinkedHashMap<>();
    // First match wins inside the ordered list, so an earlier (more authoritative) entry
    // must never be replaced by a later duplicate.
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
