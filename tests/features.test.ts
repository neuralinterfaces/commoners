import { describe, test, expect } from 'vitest'

import { resolveFeatures, featureDefines } from '../packages/core/utils/features'

describe('resolveFeatures', () => {
  test('accepts booleans, functions of the build, and { enabled } objects', () => {
    const resolved = resolveFeatures(
      {
        recording: true,
        export: ({ target }) => target !== 'web',
        telemetry: { enabled: false, canaries: ['telemetry-endpoint'] },
      },
      { target: 'electron', mode: 'production' }
    )
    expect(resolved).toEqual({ recording: true, export: true, telemetry: false })
  })

  test('the same declaration resolves per target', () => {
    const declared = { export: ({ target }: { target: string }) => target !== 'web' }
    expect(resolveFeatures(declared, { target: 'web', mode: 'production' })).toEqual({
      export: false,
    })
  })

  test('no declaration means no features', () => {
    expect(resolveFeatures(undefined, { target: 'web', mode: 'production' })).toEqual({})
  })

  // Names become identifiers in every bundle; reject anything that cannot be one
  test('rejects names that cannot become a define', () => {
    expect(() =>
      resolveFeatures({ 'bad name': true }, { target: 'web', mode: 'production' })
    ).toThrow(/feature name/i)
  })

  test('rejects non-boolean results instead of treating them as off', () => {
    expect(() =>
      resolveFeatures({ export: () => 'yes' as any }, { target: 'web', mode: 'production' })
    ).toThrow(/must resolve to true or false/)
  })
})

describe('featureDefines', () => {
  test('one define per feature plus the full map', () => {
    expect(featureDefines({ export: true, 'live-preview': false })).toEqual({
      __COMMONERS_FEATURE_EXPORT__: 'true',
      __COMMONERS_FEATURE_LIVE_PREVIEW__: 'false',
      __COMMONERS_FEATURES__: JSON.stringify({ export: true, 'live-preview': false }),
    })
  })
})
