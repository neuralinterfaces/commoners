import { createPackageConfig } from '../../vite.config.shared'

export default createPackageConfig({
  entryPoint: {
    index: 'index.ts',
    hooks: 'src/hooks.ts',
  },
  packageName: 'commoners',
  libraryName: 'commoners',
  additionalExternal: ['@commoners/solidarity'],
})
