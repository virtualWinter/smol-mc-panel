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

  private final Permissions permissions = new Permissions();
  private final Channel channel = new Channel(permissions, () -> {}, () -> {
    java.util.List<String> names = new java.util.ArrayList<>();
    // Velocity's plugin manager doesn't expose registered permissions the same way;
    // report none for now.
    return names;
  });

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
