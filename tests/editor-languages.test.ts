import assert from 'node:assert/strict'
import test from 'node:test'
import { EditorState } from '@uiw/react-codemirror'
import { ensureSyntaxTree } from '@codemirror/language'
import { editorLanguage, fileLanguage } from '../src/components/editor-languages'

test('config filenames select the appropriate syntax highlighter', () => {
  for (const [name, language] of [['velocity.toml', 'toml'], ['config/paper-global.yml', 'yaml'], ['config.YAML', 'yaml'], ['whitelist.json', 'json'], ['server.properties', 'properties'], ['eula.txt', 'properties'], ['.env', 'properties'], ['.env.local', 'properties'], ['settings.ini', 'properties'], ['start.sh', 'shell'], ['logs/latest.log', 'text'], ['README.txt', 'text']]) {
    assert.equal(fileLanguage(name), language)
  }
})

test('syntax parsers preserve configuration contents and support representative files', () => {
  for (const [name, doc] of [['velocity.toml', '# Proxy\n[servers]\nlobby = "127.0.0.1:25566"\n'], ['config.yml', '# Comment\nproxies:\n  enabled: true\n'], ['whitelist.json', '[{"name":"Example","uuid":"123"}]'], ['server.properties', '# Server\nmax-players=20\nonline-mode=false\n'], ['start.sh', '#!/bin/sh\njava -jar server.jar\n']]) {
    const state = EditorState.create({ doc, extensions: [editorLanguage(name)] })
    assert.ok(ensureSyntaxTree(state, doc.length, 1000), name)
    assert.equal(state.doc.toString(), doc)
  }
})
