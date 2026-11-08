import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  generateCargoToml,
  generateDevCargoToml,
  generateMainRs,
  generateCapabilities,
} from '../packages/core/flows/strategies/tauri-templates'
import { resolveTauriUserPlugins } from '../packages/core/flows/strategies/tauri-user-plugins'

const root = join(tmpdir(), `commoners-tauri-plugin-${process.pid}`)

beforeAll(() => {
  mkdirSync(join(root, 'rust', 'src'), { recursive: true })
  writeFileSync(
    join(root, 'rust', 'Cargo.toml'),
    '[package]\nname = "stream-plugin"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\ntauri = "2"\n'
  )
  mkdirSync(join(root, 'not-a-crate'), { recursive: true })
})

afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('resolveTauriUserPlugins', () => {
  test('reads the crate name and resolves the path against the project root', () => {
    const [plugin] = resolveTauriUserPlugins(root, {
      path: './rust',
      permissions: ['stream:allow-frames'],
    })
    expect(plugin).toEqual({
      crate: 'stream-plugin',
      ident: 'stream_plugin', // Rust identifier for the crate
      path: join(root, 'rust'),
      permissions: ['stream:allow-frames'],
    })
  })

  test('accepts a list and no config', () => {
    expect(resolveTauriUserPlugins(root, undefined)).toEqual([])
    expect(resolveTauriUserPlugins(root, [{ path: './rust' }])).toHaveLength(1)
  })

  test('fails clearly when the path has no Cargo.toml', () => {
    expect(() => resolveTauriUserPlugins(root, { path: './not-a-crate' })).toThrow(/Cargo\.toml/)
  })
})

describe('user plugin in generated files', () => {
  const plugins = [
    {
      crate: 'stream-plugin',
      ident: 'stream_plugin',
      path: '/abs/rust',
      permissions: ['stream:allow-frames'],
    },
  ]

  test('Cargo.toml depends on the crate by path (build and dev)', () => {
    expect(generateCargoToml('app', { userPlugins: plugins })).toContain(
      'stream-plugin = { path = "/abs/rust" }'
    )
    expect(generateDevCargoToml('app', { userPlugins: plugins })).toContain(
      'stream-plugin = { path = "/abs/rust" }'
    )
    expect(generateCargoToml('app')).not.toContain('stream-plugin')
  })

  test('main.rs registers the plugin, with and without services', () => {
    expect(generateMainRs([], { userPlugins: plugins })).toContain('.plugin(stream_plugin::init())')
    expect(generateMainRs([{ id: 'http', bin: 'http' }], { userPlugins: plugins })).toContain(
      '.plugin(stream_plugin::init())'
    )
    expect(generateMainRs([])).not.toContain('stream_plugin')
  })

  test('capabilities grant the declared permissions', () => {
    expect(generateCapabilities([], ['stream:allow-frames']).permissions).toContain(
      'stream:allow-frames'
    )
    expect(generateCapabilities([]).permissions).toEqual(['core:default', 'opener:default'])
  })
})
