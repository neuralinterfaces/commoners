import { join } from 'node:path'
export const globalWorkspacePath = '.commoners'
export const globalServiceWorkspacePath = join(globalWorkspacePath, 'services')
export const globalTempServiceWorkspacePath = join(globalWorkspacePath, '.tmp', 'services')
