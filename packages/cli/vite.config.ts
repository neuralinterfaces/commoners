import { createPackageConfig } from '../../vite.config.shared'

export default createPackageConfig({
  entryPoint: 'index.ts',
  packageName: 'commoners',
  libraryName: 'commoners',
  additionalExternal: ['@commoners/solidarity'],
})
