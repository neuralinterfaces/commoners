// Features decide what each build contains. Disabled code is removed at build time
// (dead-code elimination on __COMMONERS_FEATURE_<NAME>__), not just skipped at runtime.
export default {
  name: 'Features',
  icon: './icon.png',
  features: {
    export: ({ target }) => target !== 'web', // Desktop and mobile builds only
    diagnostics: false, // Never shipped
  },
}
