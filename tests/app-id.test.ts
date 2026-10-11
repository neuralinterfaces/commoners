import { describe, test, expect } from 'vitest'

import { defaultAppId } from '../packages/core/utils/app-id'

// Valid as a macOS bundle id, Tauri identifier and Android application id
const valid = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/

describe('default appId', () => {
  test.each([
    ['My Commoners App', 'com.mycommonersapp'],
    ['my-app_2', 'com.myapp2'],
    ['3D Viewer', 'com.app3dviewer'],
    ['!!!', 'com.commonersapp'],
    ['', 'com.commonersapp'],
    ['App', 'com.commonersapp'],
  ])('%j becomes %s', (name, expected) => {
    expect(defaultAppId(name)).toBe(expected)
  })

  test('is a valid identifier on every target and never ends in .app', () => {
    for (const name of ['My Commoners App', 'app', 'Ünïcode Näme', '123', 'a.b.c']) {
      const id = defaultAppId(name)
      expect(id).toMatch(valid)
      expect(id.endsWith('.app')).toBe(false)
    }
  })
})
