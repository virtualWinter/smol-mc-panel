import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { sanitizePermissions, serializePermissions } from '../src/permission-model'
import { buildPermissionPlugin, permissionSignature } from '../src/server/permission-plugin'

const java = resolve('data/java/java-25/bin/java'), javac = resolve('data/java/java-25/bin/javac'), jar = resolve('data/java/java-25/bin/jar'), javap = resolve('data/java/java-25/bin/javap')
const hasJdk = existsSync(javac) && existsSync(javap)

test('the permission plugin builds a loadable jar for Paper and Velocity from compile-only shims', { skip: !hasJdk, timeout: 120_000 }, async () => {
  const root = mkdtempSync('/tmp/opencode/permission-build-')
  try {
    const entries = (file: string) => execFileSync(jar, ['--list', '--file', file], { encoding: 'utf8' }).trim().split('\n')
    const paper = await buildPermissionPlugin(root, java, 'paper')
    const paperEntries = entries(paper)
    assert.ok(paperEntries.includes('plugin.yml'))
    assert.ok(paperEntries.includes('cc/arsn/panel/permissions/PaperPlugin.class'))
    assert.ok(paperEntries.includes('cc/arsn/panel/permissions/Permissions.class'))
    assert.ok(!paperEntries.some((entry) => entry.startsWith('org/bukkit')), 'the compile-only Bukkit shims must stay out of the jar')
    const paperClasses = execFileSync(javap, ['-p', '-cp', paper, 'cc.arsn.panel.permissions.PaperPlugin'], { encoding: 'utf8' })
    assert.match(paperClasses, /extends org\.bukkit\.plugin\.java\.JavaPlugin/u)
    assert.match(paperClasses, /implements org\.bukkit\.event\.Listener/u)
    assert.match(paperClasses, /void onEnable\(\)/u)

    const velocity = await buildPermissionPlugin(root, java, 'velocity')
    const velocityEntries = entries(velocity)
    assert.ok(velocityEntries.includes('velocity-plugin.json'))
    assert.ok(velocityEntries.includes('cc/arsn/panel/permissions/VelocityPlugin.class'))
    assert.ok(!velocityEntries.some((entry) => entry.startsWith('com/velocitypowered')), 'the compile-only Velocity shims must stay out of the jar')
    assert.match(execFileSync(javap, ['-p', '-cp', velocity, 'cc.arsn.panel.permissions.VelocityPlugin'], { encoding: 'utf8' }), /onPermissions\(/u)

    // A second build reuses the cached jar instead of recompiling.
    const before = statSync(paper).mtimeMs
    assert.equal(await buildPermissionPlugin(root, java, 'paper'), paper)
    assert.equal(statSync(paper).mtimeMs, before)
    assert.match(permissionSignature('paper'), /^[a-f0-9]{64}$/u)
    assert.notEqual(permissionSignature('paper'), permissionSignature('velocity'))
  } finally { rmSync(root, { recursive: true, force: true }) }
})

const harness = `
import cc.arsn.panel.permissions.Permissions;
import java.util.Arrays;
import java.util.TreeMap;
public class Harness {
  public static void main(String[] args) {
    Permissions permissions = new Permissions();
    permissions.refresh(true);
    for (String argument : args) {
      int split = argument.indexOf('|');
      String subject = argument.substring(0, split);
      String node = argument.substring(split + 1);
      Boolean value = permissions.value(subject.isEmpty() ? null : subject, node);
      System.out.println(argument + "=" + (value == null ? "undefined" : value));
    }
    // Attachment values: wildcards expand against the nodes a plugin registered.
    System.out.println("attachable=" + new TreeMap<String, Boolean>(permissions.attachable(
        "11111111-1111-1111-1111-111111111111",
        Arrays.asList("staff.node", "sensitive.node", "wild.card.deep.node", "c.d", "c.zzz", "unset.node"))));
  }
}`

test('the built plugin resolves the panel snapshot exactly like the model', { skip: !hasJdk, timeout: 120_000 }, async () => {
  const root = mkdtempSync('/tmp/opencode/permission-java-')
  const store = sanitizePermissions({
    defaultGroup: 'default',
    groups: [
      { name: 'default', weight: 0, inherits: [], permissions: { 'default.node': true, 'wild.card.*': true, 'c.*': false, 'c.d': true } },
      { name: 'staff', weight: 10, inherits: [], permissions: { 'staff.node': true, 'sensitive.node': false } },
    ],
    users: [{ uuid: '11111111-1111-1111-1111-111111111111', name: 'Steve', groups: ['staff'], permissions: { 'sensitive.node': true } }],
  })
  try {
    const work = resolve(root, 'harness'), classes = resolve(work, 'classes')
    mkdirSync(resolve(work, 'plugins/smol-panel'), { recursive: true })
    mkdirSync(classes)
    writeFileSync(resolve(work, 'plugins/smol-panel/permissions.txt'), serializePermissions(store))
    writeFileSync(resolve(work, 'Harness.java'), harness)
    execFileSync(javac, ['-d', classes, '-sourcepath', resolve(process.cwd(), 'permissions/shared'), resolve(work, 'Harness.java')], { timeout: 60_000 })
    const queries = [
      '11111111-1111-1111-1111-111111111111|sensitive.node=true',
      '11111111-1111-1111-1111-111111111111|staff.node=true',
      '11111111-1111-1111-1111-111111111111|default.node=true',
      '11111111-1111-1111-1111-111111111111|wild.card.anything.here=true',
      '11111111-1111-1111-1111-111111111111|c.d=true',
      '11111111-1111-1111-1111-111111111111|c.other=false',
      '11111111-1111-1111-1111-111111111111|unknown.node=undefined',
      '22222222-2222-2222-2222-222222222222|default.node=true',
      '22222222-2222-2222-2222-222222222222|staff.node=undefined',
      '|default.node=true',
    ]
    const output = execFileSync(java, ['-cp', classes, 'Harness', ...queries.map((entry) => entry.slice(0, entry.lastIndexOf('=')))], { cwd: work, encoding: 'utf8' })
    assert.deepEqual(output.trimEnd().split('\n'), [...queries, 'attachable={c.*=false, c.d=true, c.zzz=false, default.node=true, sensitive.node=true, staff.node=true, wild.card.*=true, wild.card.deep.node=true}'])
  } finally { rmSync(root, { recursive: true, force: true }) }
})
