import js from '@eslint/js'
import globals from 'globals'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'
import prettier from 'eslint-plugin-prettier'
import prettierConfig from 'eslint-config-prettier'

// Paths the source-lint entries below skip (shared so the TS-only entry matches the same set)
const sourceIgnores = [
  'dist/**',
  'node_modules/**',
  'coverage/**',
  'build/**',
  '.commoners/**',
  'docs/.vitepress/dist/**',
  'docs/.vitepress/cache/**',
  '**/assets/**',
  'docs/.vitepress/**',
  'packages/plugins/integrity/**',
  'packages/plugins/secure-services/**',
]

export default [
  // Build output and generated files, everywhere: a global ignore (an object with only
  // `ignores`) applies to every entry below, including js.configs.recommended
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.commoners/**',
      '**/build/**',
      'coverage/**',
      'docs/.vitepress/dist/**',
      'docs/.vitepress/cache/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    ignores: sourceIgnores,
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
        commoners: 'readonly',
        Electron: 'readonly',
      },
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        // No type-aware rules are enabled, so no tsconfig project: files outside every
        // tsconfig (configs, examples, scripts) parse instead of failing
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      prettier,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...prettierConfig.rules,

      // TypeScript specific
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',

      // General code quality
      'no-console': 'warn',
      'prefer-const': 'error',
      'no-var': 'error',

      // Prettier integration
      'prettier/prettier': 'error',
    },
  },
  // TypeScript-only ambient types (lib.dom / @types/node) that no-undef cannot see,
  // declared like `Electron` above rather than turning no-undef off for TS
  {
    files: ['**/*.{ts,tsx}'],
    ignores: sourceIgnores,
    languageOptions: {
      globals: {
        NodeJS: 'readonly',
        BufferEncoding: 'readonly',
        NodeListOf: 'readonly',
        IDBTransactionMode: 'readonly',
        WindowProxy: 'readonly',
      },
    },
  },
]
