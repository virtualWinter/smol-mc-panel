import assert from 'node:assert/strict'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import test from 'node:test'
import { TelemetryCollector } from '../src/server/telemetry'
import { defaults } from './helpers'

const java = resolve('data/java/java-25/bin/java'), javac = resolve('data/java/java-25/bin/javac')
test('Java bridge reports proxy players and executes a UUID-only disconnect over its authenticated socket', { skip: !existsSync(javac), timeout: 20_000 }, async () => {
  const root = mkdtempSync('/tmp/opencode/agent-control-')
  let child: ChildProcess | undefined
  const collector = new TelemetryCollector(root, () => child?.pid)
  try {
    mkdirSync(resolve(root, 'net/kyori/adventure/text'), { recursive: true })
    writeFileSync(resolve(root, 'net/kyori/adventure/text/Component.java'), 'package net.kyori.adventure.text; public class Component { public static Component text(String value) { return new Component(); } }')
    mkdirSync(resolve(root, 'com/velocitypowered/api/proxy/server'), { recursive: true })
    writeFileSync(resolve(root, 'com/velocitypowered/api/proxy/server/ServerInfo.java'), `
package com.velocitypowered.api.proxy.server;
import java.net.InetSocketAddress;
import java.util.Objects;
public class ServerInfo {
  private final String name; private final InetSocketAddress address;
  public ServerInfo(String name, InetSocketAddress address) { this.name = name; this.address = address; }
  public String getName() { return name; }
  public InetSocketAddress getAddress() { return address; }
  @Override public boolean equals(Object other) { return other instanceof ServerInfo info && Objects.equals(name, info.name) && Objects.equals(address, info.address); }
  @Override public int hashCode() { return Objects.hash(name, address); }
}`)
    writeFileSync(resolve(root, 'com/velocitypowered/api/proxy/server/RegisteredServer.java'), 'package com.velocitypowered.api.proxy.server; public interface RegisteredServer { ServerInfo getServerInfo(); }')
    writeFileSync(resolve(root, 'ControlMain.java'), `
import cc.arsn.panel.metrics.Bridge;
import com.velocitypowered.api.proxy.server.RegisteredServer;
import com.velocitypowered.api.proxy.server.ServerInfo;
import java.net.InetSocketAddress;
import java.util.*;
import net.kyori.adventure.text.Component;
public class ControlMain {
  public static class Player {
    public String getUsername() { return "Example"; }
    public UUID getUniqueId() { return UUID.fromString("11111111-1111-1111-1111-111111111111"); }
    public long getPing() { return 20; }
    public Optional<Object> getCurrentServer() { return Optional.empty(); }
    public void disconnect(Component reason) { System.out.println("DISCONNECTED"); }
    public Optional<RegisteredServer> getNextServerToTry() { return Optional.of(Proxy.lobby); }
    public ConnectionRequest createConnectionRequest(RegisteredServer server) { return new ConnectionRequest(server); }
  }
  public static class ConnectionRequest {
    private final RegisteredServer server;
    public ConnectionRequest(RegisteredServer server) { this.server = server; }
    public Object connect() { System.out.println("MOVED " + server.getServerInfo().getName()); return null; }
  }
  public static class Registration implements RegisteredServer {
    private final ServerInfo info; private final List<Player> players = new ArrayList<>();
    public Registration(ServerInfo info) { this.info = info; }
    public ServerInfo getServerInfo() { return info; }
    public Collection<Player> getPlayersConnected() { return players; }
    public void occupy(Player player) { players.add(player); }
  }
  public static class Configuration {
    public void setAttemptConnectionOrder(List<String> order) { System.out.println("ORDER " + String.join("|", order)); }
  }
  public static class Proxy {
    public static class Version { public String getVersion() { return "4.2.1-SNAPSHOT"; } }
    public static final RegisteredServer lobby = new Registration(new ServerInfo("lobby", new InetSocketAddress("127.0.0.1", 25567)));
    final Player player = new Player();
    final Configuration configuration = new Configuration();
    final Map<String, RegisteredServer> servers = new LinkedHashMap<>();
    public Version getVersion() { return new Version(); }
    public int getPlayerCount() { return 1; }
    public Collection<Player> getAllPlayers() { return List.of(player); }
    public Optional<Player> getPlayer(UUID uuid) { return uuid.equals(player.getUniqueId()) ? Optional.of(player) : Optional.empty(); }
    public Configuration getConfiguration() { return configuration; }
    public Collection<RegisteredServer> getAllServers() { return new ArrayList<>(servers.values()); }
    public RegisteredServer registerServer(ServerInfo info) {
      System.out.println("REGISTER " + info.getName() + " " + info.getAddress());
      Registration registration = new Registration(info);
      servers.put(info.getName().toLowerCase(Locale.US), registration);
      return registration;
    }
    public void unregisterServer(ServerInfo info) {
      RegisteredServer existing = servers.get(info.getName().toLowerCase(Locale.US));
      if (existing == null || !existing.getServerInfo().equals(info)) throw new IllegalArgumentException("not registered");
      System.out.println("UNREGISTER " + info.getName());
      servers.remove(info.getName().toLowerCase(Locale.US));
    }
  }
  public static void main(String[] args) throws Exception {
    Proxy proxy = new Proxy();
    Registration survival = new Registration(new ServerInfo("survival", new InetSocketAddress("127.0.0.1", 25566)));
    survival.occupy(proxy.player);
    proxy.servers.put("survival", survival);
    proxy.servers.put("lobby", Proxy.lobby);
    Bridge.bindProxy(proxy);
    Bridge.configure(args[0], null);
    Thread.sleep(20000);
  }
}`)
    execFileSync(javac, ['--release', '17', '-d', root, resolve('agent/src/cc/arsn/panel/metrics/Bridge.java'), resolve(root, 'ControlMain.java'), resolve(root, 'net/kyori/adventure/text/Component.java'), resolve(root, 'com/velocitypowered/api/proxy/server/ServerInfo.java'), resolve(root, 'com/velocitypowered/api/proxy/server/RegisteredServer.java')], { timeout: 10_000 })
    await collector.start()
    const configuration = collector.configuration(defaults()[0])
    assert.throws(() => collector.setServers('proxy', ['lobby'], [['lobby', '127.0.0.1:25567']]), /Restart/u)
    child = spawn(java, ['-cp', root, 'ControlMain', configuration], { stdio: ['ignore', 'pipe', 'pipe'] })
    let output = '', errors = ''
    child.stdout!.on('data', (chunk) => { output += chunk })
    child.stderr!.on('data', (chunk) => { errors += chunk })
    for (let i = 0; i < 60 && !collector.latest('proxy')?.proxyControl; i++) await delay(100)
    assert.equal(collector.latest('proxy')?.players?.[0].name, 'Example', errors)
    assert.equal(collector.latest('proxy')?.proxyVersion, '4.2.1-SNAPSHOT')
    assert.equal(collector.latest('proxy')?.proxyTopology, true)
    collector.kick('proxy', '11111111-1111-1111-1111-111111111111')
    for (let i = 0; i < 60 && !output.includes('DISCONNECTED'); i++) await delay(100)
    assert.ok(output.includes('DISCONNECTED'), errors || 'Java bridge did not disconnect the selected UUID')

    // Removing a backend moves its players to the fallback and leaves the rest of the proxy untouched.
    assert.throws(() => collector.setServers('proxy', ['lobby'], []), /Keep at least one/u)
    assert.throws(() => collector.setServers('proxy', ['lobby'], [['Bad Name', '127.0.0.1:25567']]), /topology/u)
    collector.setServers('proxy', ['lobby'], [['lobby', '127.0.0.1:25567']])
    for (let i = 0; i < 60 && !(output.includes('UNREGISTER survival') && output.includes('MOVED lobby') && output.includes('ORDER lobby')); i++) await delay(100)
    assert.ok(output.includes('UNREGISTER survival'), errors || 'removed backend stayed registered')
    assert.ok(output.includes('MOVED lobby'), errors || 'players were not moved off the removed backend')
    assert.ok(output.includes('ORDER lobby'), errors || 'fallback order was not updated')
    assert.ok(!/(^|\n)REGISTER /u.test(output), errors || 'an unchanged backend was re-registered')

    // Re-pointing an address and adding a backend registers both without a full reload.
    collector.setServers('proxy', ['lobby', 'creative'], [['lobby', '127.0.0.1:25577'], ['creative', '127.0.0.1:25568']])
    for (let i = 0; i < 60 && !(/(^|\n)REGISTER lobby .*25577/u.test(output) && /(^|\n)REGISTER creative /u.test(output) && output.includes('ORDER lobby|creative')); i++) await delay(100)
    assert.ok(output.includes('UNREGISTER lobby'), errors || 'a re-pointed backend was not removed first')
    assert.ok(/(^|\n)REGISTER lobby .*25577/u.test(output), errors || 'a re-pointed backend was not registered')
    assert.ok(/(^|\n)REGISTER creative /u.test(output), errors || 'a new backend was not registered')
    assert.ok(output.includes('ORDER lobby|creative'), errors || 'fallback order was not updated again')
  } finally {
    if (child && child.exitCode === null) { child.kill('SIGTERM'); await new Promise<void>((done) => child!.once('exit', () => done())) }
    await collector.close(); rmSync(root, { recursive: true, force: true })
  }
})
