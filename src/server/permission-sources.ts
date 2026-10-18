import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export interface PermissionSources {
  /** Relative path -> Java source. Only `cc/` entries end up in the jar. */
  sources: Record<string, string>
  /** The plugin descriptor written to the jar root. */
  descriptor: { path: string; content: string }
}

/** Compile-only shims.
 *
 * The plugin is compiled against these instead of a downloaded platform API, so it never
 * depends on a specific server version. They are intentionally empty apart from the few
 * members the plugin calls; the real classes are supplied by the server at runtime and
 * only the `cc/` tree is packaged. */
const paperStubs: Record<string, string> = {
  'org/bukkit/plugin/Plugin.java': 'package org.bukkit.plugin; public interface Plugin {}',
  'org/bukkit/plugin/java/JavaPlugin.java': `
package org.bukkit.plugin.java;
import java.util.logging.Logger;
import org.bukkit.Server;
import org.bukkit.plugin.Plugin;
public abstract class JavaPlugin implements Plugin {
  public void onEnable() {}
  public void onDisable() {}
  public Server getServer() { return null; }
  public Logger getLogger() { return null; }
}`,
  'org/bukkit/plugin/PluginManager.java': `
package org.bukkit.plugin;
import java.util.Set;
import org.bukkit.event.Listener;
import org.bukkit.permissions.Permission;
public interface PluginManager {
  void registerEvents(Listener listener, Plugin plugin);
  Set<Permission> getPermissions();
}`,
  'org/bukkit/Server.java': `
package org.bukkit;
import java.util.Collection;
import org.bukkit.entity.Player;
import org.bukkit.plugin.PluginManager;
import org.bukkit.scheduler.BukkitScheduler;
public interface Server {
  PluginManager getPluginManager();
  BukkitScheduler getScheduler();
  Collection<? extends Player> getOnlinePlayers();
}`,
  'org/bukkit/scheduler/BukkitTask.java': 'package org.bukkit.scheduler; public interface BukkitTask {}',
  'org/bukkit/scheduler/BukkitScheduler.java': `
package org.bukkit.scheduler;
import org.bukkit.plugin.Plugin;
public interface BukkitScheduler {
  BukkitTask runTaskTimer(Plugin plugin, Runnable task, long delay, long period);
}`,
  'org/bukkit/event/Listener.java': 'package org.bukkit.event; public interface Listener {}',
  'org/bukkit/event/EventHandler.java': `
package org.bukkit.event;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.METHOD)
public @interface EventHandler {}`,
  'org/bukkit/event/player/PlayerJoinEvent.java': `
package org.bukkit.event.player;
import org.bukkit.entity.Player;
public class PlayerJoinEvent { public Player getPlayer() { return null; } }`,
  'org/bukkit/event/player/PlayerQuitEvent.java': `
package org.bukkit.event.player;
import org.bukkit.entity.Player;
public class PlayerQuitEvent { public Player getPlayer() { return null; } }`,
  'org/bukkit/entity/Player.java': `
package org.bukkit.entity;
import java.util.UUID;
import org.bukkit.permissions.Permissible;
public interface Player extends Permissible { UUID getUniqueId(); }`,
  'org/bukkit/permissions/Permissible.java': `
package org.bukkit.permissions;
import org.bukkit.plugin.Plugin;
public interface Permissible { PermissionAttachment addAttachment(Plugin plugin); }`,
  'org/bukkit/permissions/PermissionAttachment.java': `
package org.bukkit.permissions;
public class PermissionAttachment {
  public void setPermission(String name, boolean value) {}
  public void remove() {}
}`,
  'org/bukkit/permissions/Permission.java': `
package org.bukkit.permissions;
public class Permission { public String getName() { return null; } }`,
}

const velocityStubs: Record<string, string> = {
  'com/velocitypowered/api/plugin/Plugin.java': `
package com.velocitypowered.api.plugin;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.TYPE)
public @interface Plugin { String id(); String name() default ""; String version() default ""; }`,
  'com/velocitypowered/api/event/Subscribe.java': `
package com.velocitypowered.api.event;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.METHOD)
public @interface Subscribe {}`,
  'com/velocitypowered/api/event/proxy/ProxyInitializeEvent.java': 'package com.velocitypowered.api.event.proxy; public class ProxyInitializeEvent {}',
  'com/velocitypowered/api/event/permission/PermissionsSetupEvent.java': `
package com.velocitypowered.api.event.permission;
import com.velocitypowered.api.permission.PermissionProvider;
public class PermissionsSetupEvent { public void setProvider(PermissionProvider provider) {} }`,
  'com/velocitypowered/api/permission/PermissionProvider.java': `
package com.velocitypowered.api.permission;
public interface PermissionProvider { PermissionFunction createFunction(PermissionSubject subject); }`,
  'com/velocitypowered/api/permission/PermissionFunction.java': `
package com.velocitypowered.api.permission;
@FunctionalInterface
public interface PermissionFunction { Tristate getPermissionValue(String permission); }`,
  'com/velocitypowered/api/permission/PermissionSubject.java': 'package com.velocitypowered.api.permission; public interface PermissionSubject {}',
  'com/velocitypowered/api/permission/Tristate.java': `
package com.velocitypowered.api.permission;
public enum Tristate {
  TRUE, FALSE, UNDEFINED;
  public static Tristate fromNullableBoolean(Boolean value) { return value == null ? UNDEFINED : value ? TRUE : FALSE; }
}`,
  'com/velocitypowered/api/proxy/Player.java': `
package com.velocitypowered.api.proxy;
import java.util.UUID;
import com.velocitypowered.api.permission.PermissionSubject;
public interface Player extends PermissionSubject { UUID getUniqueId(); }`,
}

/** Reads the plugin sources for one platform. Mirrors `readAgentSources`. */
export function readPermissionSources(platform: 'paper' | 'velocity'): PermissionSources {
  const root = resolve(process.cwd(), 'permissions')
  const sources: Record<string, string> = {}
  const base = 'cc/arsn/panel/permissions'
  sources[`${base}/Permissions.java`] = readFileSync(resolve(root, 'shared', base, 'Permissions.java'), 'utf8')
  const entry = platform === 'paper' ? 'PaperPlugin' : 'VelocityPlugin'
  sources[`${base}/${entry}.java`] = readFileSync(resolve(root, platform, base, `${entry}.java`), 'utf8')
  for (const [path, source] of Object.entries(platform === 'paper' ? paperStubs : velocityStubs)) sources[path] = source
  return {
    sources,
    descriptor: platform === 'paper'
      ? { path: 'plugin.yml', content: readFileSync(resolve(root, 'paper', 'plugin.yml'), 'utf8') }
      : { path: 'velocity-plugin.json', content: readFileSync(resolve(root, 'velocity', 'velocity-plugin.json'), 'utf8') },
  }
}
