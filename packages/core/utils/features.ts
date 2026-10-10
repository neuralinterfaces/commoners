/**
 * Features: which parts of an app a build includes. Resolved once per build and applied to
 * every build site as compile-time defines, so disabled code is removed by dead-code
 * elimination rather than switched off at runtime. See docs/roadmap/features-and-compile-out.md.
 *
 * (Distinct from extension `capabilities`, which describe what a plugin provides.)
 */

export type FeatureContext = { target: string; mode: 'development' | 'production' }

export type FeatureDeclaration =
  | boolean
  | ((context: FeatureContext) => boolean)
  | {
      enabled: boolean | ((context: FeatureContext) => boolean)
      canaries?: string[]
      modules?: string[]
    }

export type FeatureMap = Record<string, boolean>

const VALID_NAME = /^[a-z][a-z0-9_-]*$/i

export const featureDefineName = (name: string) =>
  `__COMMONERS_FEATURE_${name.toUpperCase().replace(/-/g, '_')}__`

export const resolveFeatures = (
  declared: Record<string, FeatureDeclaration> | undefined,
  context: FeatureContext
): FeatureMap => {
  const resolved: FeatureMap = {}
  for (const [name, declaration] of Object.entries(declared ?? {})) {
    if (!VALID_NAME.test(name))
      throw new Error(`Invalid feature name "${name}": use letters, digits, - and _`)

    const enabled = typeof declaration === 'object' ? declaration.enabled : declaration
    const value = typeof enabled === 'function' ? enabled(context) : enabled
    if (typeof value !== 'boolean')
      throw new Error(`Feature "${name}" must resolve to true or false (got ${typeof value})`)
    resolved[name] = value
  }
  return resolved
}

/** Defines applied to every bundle: one boolean per feature, plus the whole map. */
export const featureDefines = (features: FeatureMap): Record<string, string> => ({
  ...Object.fromEntries(
    Object.entries(features).map(([name, enabled]) => [featureDefineName(name), String(enabled)])
  ),
  __COMMONERS_FEATURES__: JSON.stringify(features),
})
