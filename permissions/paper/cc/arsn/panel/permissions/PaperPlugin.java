package cc.arsn.panel.permissions;

import java.util.HashMap;
import java.util.HashSet;
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

/**
 * Applies the panel's resolved nodes to every Paper player as a permission attachment.
 *
 * Attachments are the sanctioned Bukkit API and answer by exact node name, so wildcard
 * entries are also expanded against the permissions plugins actually registered. The
 * panel writes the snapshot; this plugin only reads it and re-applies on change.
 */
public final class PaperPlugin extends JavaPlugin implements Listener {

  private final Permissions permissions = new Permissions();
  private final Map<UUID, PermissionAttachment> applied = new HashMap<>();

  @Override
  public void onEnable() {
    this.permissions.start();
    getServer().getPluginManager().registerEvents(this, this);
    getServer().getScheduler().runTaskTimer(this, this::reload, 100L, 100L);
  }

  @Override
  public void onDisable() {
    this.permissions.stop();
    for (PermissionAttachment attachment : this.applied.values()) attachment.remove();
    this.applied.clear();
  }

  @EventHandler
  public void onJoin(PlayerJoinEvent event) {
    apply(event.getPlayer());
  }

  @EventHandler
  public void onQuit(PlayerQuitEvent event) {
    PermissionAttachment attachment = this.applied.remove(event.getPlayer().getUniqueId());
    if (attachment != null) attachment.remove();
  }

  /** Re-applies attachments only when the panel rewrote the snapshot. */
  private void reload() {
    try {
      if (!this.permissions.refresh(false)) return;
      for (Player player : getServer().getOnlinePlayers()) apply(player);
    } catch (RuntimeException error) {
      getLogger().warning("Could not apply permissions: " + error.getMessage());
    }
  }

  private void apply(Player player) {
    UUID uuid = player.getUniqueId();
    PermissionAttachment previous = this.applied.remove(uuid);
    if (previous != null) previous.remove();
    Set<String> registered = new HashSet<>();
    for (Permission permission : getServer().getPluginManager().getPermissions()) registered.add(permission.getName());
    Map<String, Boolean> values = this.permissions.attachable(uuid.toString(), registered);
    if (values.isEmpty()) return;
    PermissionAttachment attachment = player.addAttachment(this);
    // Bukkit only exposes single-node writes and each write recalculates the player's
    // effective permissions, so this stays a loop over the resolved snapshot.
    for (Map.Entry<String, Boolean> entry : values.entrySet()) attachment.setPermission(entry.getKey(), entry.getValue());
    this.applied.put(uuid, attachment);
  }
}
