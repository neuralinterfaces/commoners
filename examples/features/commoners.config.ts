// Features decide what each build contains. Disabled code is removed at build time
// (dead-code elimination on __COMMONERS_FEATURE_<NAME>__), not just skipped at runtime.
export default {
  name: 'Features',
  icon: './icon.png',
  features: {
    // Canaries: strings only that feature's code contains. Each build checks that a disabled
    // feature's canaries are absent and an enabled feature's are present
    export: { enabled: ({ target }) => target !== 'web', canaries: ['canary-export-7f3a'] }, // Desktop and mobile only
    diagnostics: { enabled: false, canaries: ['canary-diagnostics-91c2'] }, // Never shipped
  },
}
