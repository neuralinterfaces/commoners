// Legacy adapter - deprecated in favor of hooks-based approach
// This file is kept for backwards compatibility but should not be used in new code

import { ui } from './index.js'

// Legacy wrapper functions - use cliHooks for new code
export const printHeader = (message: string, subtitle?: string) => ui.header(message, { subtitle })
export const printTarget = (target: string) => ui.target(target)
export const printFailure = (message: string, details?: string) => ui.error(message, details)
export const printSubtle = (message: string) => ui.subtle(message)
export const printSuccess = (message: string, details?: string) => ui.success(message, details)
export const printWarning = (message: string, details?: string) => ui.warning(message, details)
export const printServiceMessage = (
  serviceName: string,
  message: string,
  type: 'info' | 'error' | 'success' = 'info'
) => ui.service(serviceName, message, type)

export const devServer = {
  starting: (target: string, port?: number) => {
    const spinner = ui.spinner(
      `Starting ${ui.target(target, { plain: true })} development server${port ? ` on port ${port}` : ''}...`,
      { type: 'dots', color: 'primary' }
    )
    return spinner
  },
  ready: (target: string, url?: string) => {
    return ui.success(
      `${target} development server ready!`,
      url ? `Available at: ${url}` : undefined
    )
  },
}

export const commandFeedback = {
  launched: (message: string, details?: string) => {
    ui.box(`${message}${details ? `\n\n${details}` : ''}`, {
      title: '✨ Launch Complete',
      borderColor: 'success',
      align: 'center',
    })
  },
}
