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

/**
 * Answers the proxy's permission checks from the panel's resolved nodes.
 *
 * Velocity asks for one node at a time, so the same ordered list the Paper side uses
 * answers directly — wildcards included. The console keeps its own defaults.
 */
@Plugin(id = "smol-panel", name = "smol-panel", version = "1.0")
public final class VelocityPlugin {

  private final Permissions permissions = new Permissions();

  @Subscribe
  public void onInitialize(ProxyInitializeEvent event) {
    this.permissions.start();
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
