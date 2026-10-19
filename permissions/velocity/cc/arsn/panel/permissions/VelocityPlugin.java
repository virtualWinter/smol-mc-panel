package cc.arsn.panel.permissions;

import com.velocitypowered.api.event.Subscribe;
import com.velocitypowered.api.event.permission.PermissionsSetupEvent;
import com.velocitypowered.api.event.proxy.ProxyInitializeEvent;
import com.velocitypowered.api.permission.PermissionFunction;
import com.velocitypowered.api.permission.PermissionProvider;
import com.velocitypowered.api.permission.PermissionSubject;
import com.velocitypowered.api.permission.Tristate;
import com.velocitypowered.api.plugin.Plugin;
import com.velocitypowered.api.proxy.Player;

@Plugin(id = "smol-panel", name = "smol-panel", version = "1.0")
public final class VelocityPlugin {

  // Velocity has no permission registry, so plugins' nodes cannot be enumerated.
  // The proxy's own built-in command permissions are the only ones we can report.
  private static final java.util.List<String> BUILT_IN_PERMISSIONS = java.util.List.of(
      "velocity.command.dump",
      "velocity.command.glist",
      "velocity.command.heap",
      "velocity.command.info",
      "velocity.command.plugins",
      "velocity.command.reload",
      "velocity.command.send",
      "velocity.command.server");

  private final Permissions permissions = new Permissions();
  private final Channel channel = new Channel(permissions, () -> {}, () -> BUILT_IN_PERMISSIONS);

  @Subscribe
  public void onInitialize(ProxyInitializeEvent event) {
    this.permissions.loadCache();
    this.permissions.onChange(() -> {});
    this.permissions.start();
    this.channel.start();
  }

  @Subscribe
  public void onPermissions(PermissionsSetupEvent event) {
    event.setProvider(new Provider());
  }

  private final class Provider implements PermissionProvider {
    @Override
    public PermissionFunction createFunction(PermissionSubject subject) {
      if (!(subject instanceof Player)) return permission -> Tristate.UNDEFINED;
      String key = ((Player) subject).getUniqueId().toString();
      return permission -> Tristate.fromNullableBoolean(VelocityPlugin.this.permissions.value(key, permission));
    }
  }
}
