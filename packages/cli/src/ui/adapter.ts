// Adapter to gradually replace @commoners/solidarity formatting
// This allows us to maintain compatibility while enhancing the CLI experience

import { ui } from './index.js'

// Enhanced wrapper functions that provide richer experience than core
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

// Development server feedback
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

// Command feedback
export const commandFeedback = {
  launched: (message: string, details?: string) => {
    ui.box(`${message}${details ? `\n\n${details}` : ''}`, {
      title: '✨ Launch Complete',
      borderColor: 'success',
      align: 'center',
    })
  },
}
