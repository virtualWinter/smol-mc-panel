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
    writeFileSync(resolve(root, 'ControlMain.java'), `
import cc.arsn.panel.metrics.Bridge;
import java.util.*;
import net.kyori.adventure.text.Component;
public class ControlMain {
  public static class Player {
    public String getUsername() { return "Example"; }
    public UUID getUniqueId() { return UUID.fromString("11111111-1111-1111-1111-111111111111"); }
    public long getPing() { return 20; }
    public Optional<Object> getCurrentServer() { return Optional.empty(); }
    public void disconnect(Component reason) { System.out.println("DISCONNECTED"); }
  }
  public static class Proxy {
    public static class Version { public String getVersion() { return "4.2.1-SNAPSHOT"; } }
    public Version getVersion() { return new Version(); }
    final Player player = new Player();
    public int getPlayerCount() { return 1; }
    public Collection<Player> getAllPlayers() { return List.of(player); }
    public Optional<Player> getPlayer(UUID uuid) { return uuid.equals(player.getUniqueId()) ? Optional.of(player) : Optional.empty(); }
  }
  public static void main(String[] args) throws Exception {
    Bridge.bindProxy(new Proxy());
    Bridge.configure(args[0], null);
    Thread.sleep(15000);
  }
}`)
    execFileSync(javac, ['--release', '17', '-d', root, resolve('agent/src/cc/arsn/panel/metrics/Bridge.java'), resolve(root, 'ControlMain.java'), resolve(root, 'net/kyori/adventure/text/Component.java')], { timeout: 10_000 })
    await collector.start()
    const configuration = collector.configuration(defaults()[0])
    child = spawn(java, ['-cp', root, 'ControlMain', configuration], { stdio: ['ignore', 'pipe', 'pipe'] })
    let output = '', errors = ''
    child.stdout!.on('data', (chunk) => { output += chunk })
    child.stderr!.on('data', (chunk) => { errors += chunk })
    for (let i = 0; i < 60 && !collector.latest('proxy')?.proxyControl; i++) await delay(100)
    assert.equal(collector.latest('proxy')?.players?.[0].name, 'Example', errors)
    assert.equal(collector.latest('proxy')?.proxyVersion, '4.2.1-SNAPSHOT')
    collector.kick('proxy', '11111111-1111-1111-1111-111111111111')
    for (let i = 0; i < 60 && !output.includes('DISCONNECTED'); i++) await delay(100)
    assert.ok(output.includes('DISCONNECTED'), errors || 'Java bridge did not disconnect the selected UUID')
  } finally {
    if (child && child.exitCode === null) { child.kill('SIGTERM'); await new Promise<void>((done) => child!.once('exit', () => done())) }
    await collector.close(); rmSync(root, { recursive: true, force: true })
  }
})
