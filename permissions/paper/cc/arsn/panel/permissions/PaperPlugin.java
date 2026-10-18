package cc.arsn.panel.permissions;

import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.permissions.Permission;
import org.bukkit.permissions.PermissionAttachment;
import org.bukkit.plugin.java.JavaPlugin;

public final class PaperPlugin extends JavaPlugin implements Listener {

  private final Permissions permissions = new Permissions();
  private final Channel channel = new Channel(permissions, this::applyAll);
  private final java.util.Map<UUID, PermissionAttachment> applied = new java.util.HashMap<>();

  @Override
  public void onEnable() {
    this.permissions.loadCache();
    this.permissions.onChange(() -> getServer().getScheduler().runTask(this, this::applyAll));
    this.permissions.start();
    this.channel.start();
    getServer().getPluginManager().registerEvents(this, this);
  }

  @Override
  public void onDisable() {
    this.channel.stop();
    this.permissions.stop();
    for (PermissionAttachment attachment : this.applied.values()) attachment.remove();
    this.applied.clear();
  }

  @EventHandler
  public void onJoin(PlayerJoinEvent event) { apply(event.getPlayer()); }

  @EventHandler
  public void onQuit(PlayerQuitEvent event) {
    PermissionAttachment attachment = this.applied.remove(event.getPlayer().getUniqueId());
    if (attachment != null) attachment.remove();
  }

  private void applyAll() {
    for (Player player : getServer().getOnlinePlayers()) apply(player);
  }

  private void apply(Player player) {
    UUID uuid = player.getUniqueId();
    PermissionAttachment previous = this.applied.remove(uuid);
    if (previous != null) previous.remove();
    Set<String> registered = new java.util.HashSet<>();
    for (Permission permission : getServer().getPluginManager().getPermissions()) registered.add(permission.getName());
    Map<String, Boolean> values = this.permissions.attachable(uuid.toString(), registered);
    if (values.isEmpty()) return;
    PermissionAttachment attachment = player.addAttachment(this);
    for (Map.Entry<String, Boolean> entry : values.entrySet()) attachment.setPermission(entry.getKey(), entry.getValue());
    this.applied.put(uuid, attachment);
  }

}
