package cc.arsn.panel.permissions;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.UnixDomainSocketAddress;
import java.nio.channels.Channels;
import java.nio.channels.SocketChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Properties;

/** Connects to the panel and applies permission snapshots as they arrive. */
public final class Channel {
  private final Permissions permissions;
  private final Runnable onChange;
  private final String socketPath;
  private final String serverId;
  private final String token;
  private final long pid;
  private Thread thread;

  public Channel(Permissions permissions, Runnable onChange) {
    this.permissions = permissions;
    this.onChange = onChange;
    Properties props = loadProperties();
    this.socketPath = props == null ? null : props.getProperty("socket");
    this.serverId = props == null ? null : props.getProperty("serverId");
    this.token = props == null ? null : props.getProperty("token");
    this.pid = ProcessHandle.current().pid();
  }

  private static Properties loadProperties() {
    try (var reader = Files.newBufferedReader(Paths.get("plugins/smol-panel/client.properties"), StandardCharsets.UTF_8)) {
      Properties p = new Properties();
      p.load(reader);
      return p;
    } catch (IOException ignored) { return null; }
  }

  public boolean available() { return socketPath != null && serverId != null && token != null; }

  public void start() {
    if (!available()) return;
    thread = new Thread(this::run, "smol-panel-permissions-channel");
    thread.setDaemon(true);
    thread.start();
  }

  public void stop() { if (thread != null) thread.interrupt(); }

  private void run() {
    int backoff = 1000;
    while (!Thread.currentThread().isInterrupted()) {
      try {
        try (SocketChannel channel = SocketChannel.open(UnixDomainSocketAddress.of(Paths.get(socketPath)))) {
          channel.configureBlocking(true);
          OutputStream out = Channels.newOutputStream(channel);
          InputStream in = Channels.newInputStream(channel);
          String auth = "{\"version\":1,\"serverId\":\"" + escape(serverId) + "\",\"token\":\"" + escape(token) + "\",\"pid\":" + pid + "}\n";
          out.write(auth.getBytes(StandardCharsets.UTF_8));
          out.flush();
          while (true) {
            String header = readLine(in);
            if (header == null) break;
            if (header.startsWith("SNAPSHOT ")) {
              int n = Integer.parseInt(header.substring(9).trim());
              byte[] buf = new byte[n];
              int read = 0;
              while (read < n) {
                int r = in.read(buf, read, n - read);
                if (r < 0) throw new IOException("unexpected end of stream");
                read += r;
              }
              String content = new String(buf, StandardCharsets.UTF_8);
              permissions.cache(content);
              permissions.update(content);
            }
          }
        }
        backoff = 1000;
      } catch (Exception ignored) {
        try { Thread.sleep(backoff); } catch (InterruptedException stopped) { return; }
        backoff = Math.min(backoff * 2, 30000);
      }
    }
  }

  private static String readLine(InputStream in) throws IOException {
    java.io.ByteArrayOutputStream buf = new java.io.ByteArrayOutputStream();
    int b;
    while ((b = in.read()) != -1) {
      if (b == '\n') break;
      buf.write(b);
    }
    if (b == -1 && buf.size() == 0) return null;
    return buf.toString(StandardCharsets.UTF_8);
  }

  private static String escape(String value) {
    return value.replace("\\", "\\\\").replace("\"", "\\\"");
  }
}
