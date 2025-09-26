/* eslint-disable no-console */
// Modern CLI UI Library for Commoners
// Provides rich, interactive styling decoupled from core functionality

import chalkModule from 'chalk'
import oraModule, { Ora } from 'ora'
import boxenModule from 'boxen'
import figuresModule from 'figures'

const chalk = chalkModule.default || chalkModule
const ora = oraModule.default || oraModule
const boxen = boxenModule.default || boxenModule
const figures = figuresModule.default || figuresModule

export interface UITheme {
  primary: string
  secondary: string
  success: string
  warning: string
  error: string
  info: string
  muted: string
}

const defaultTheme: UITheme = {
  primary: '#A7C6ED',
  secondary: '#B8D6F0',
  success: '#34D399', // Green
  warning: '#FBBF24', // Yellow
  error: '#EF4444', // Red
  info: '#60A5FA', // Blue
  muted: '#9CA3AF', // Gray
}

export class CommonersUI {
  private theme: UITheme
  private activeSpinners: Set<Ora> = new Set()

  constructor(theme: UITheme = defaultTheme) {
    this.theme = theme

    // Cleanup spinners on exit

    process.on('exit', () => this.cleanup())

    process.on('SIGINT', () => this.cleanup())
  }

  private cleanup() {
    this.activeSpinners.forEach(spinner => {
      if (spinner.isSpinning) spinner.stop()
    })
    this.activeSpinners.clear()
  }

  // Enhanced Headers
  header(message: string, options?: { subtitle?: string }) {
    const { subtitle } = options || {}

    const title = chalk.hex(this.theme.primary).bold(message)

    console.log('\n' + title)

    if (subtitle) console.log(chalk.hex(this.theme.muted)(subtitle))

    console.log()
  }

  // Target-specific styling
  target(targetName: string, options?: { plain?: boolean }) {
    const { plain = false } = options || {}

    const colors = {
      web: this.theme.info,
      pwa: this.theme.secondary,
      desktop: this.theme.primary,
      electron: '#47848f',
      mobile: this.theme.warning,
      ios: '#007AFF',
      android: '#3DDC84',
      tauri: '#FFC131',
    }

    const titled = {
      pwa: 'PWA',
      ios: 'iOS',
    }

    const lower = targetName.toLowerCase()
    const color = colors[lower] || this.theme.primary
    const title = titled[lower] || targetName.charAt(0).toUpperCase() + targetName.slice(1)

    // Return plain text if requested, or use chalk for coloring
    return plain ? title : `${chalk.hex(color).bold(title)}`
  }

  // Success messages with celebration
  success(message: string, details?: string) {
    console.log(`\n${figures.tick} ${chalk.hex(this.theme.success).bold(message)}`)
    if (details) console.log(chalk.hex(this.theme.muted)(`  ${details}`))
    console.log()
  }

  // Enhanced error messages
  error(message: string, details?: string) {
    console.log(`\n${figures.cross} ${chalk.hex(this.theme.error).bold(message)}`)
    if (details) console.log(chalk.hex(this.theme.muted)(`  ${details}`))
    console.log()
  }

  // Warning messages
  warning(message: string, details?: string) {
    console.log(`\n${figures.warning} ${chalk.hex(this.theme.warning)(message)}`)
    if (details) console.log(chalk.hex(this.theme.muted)(`  ${details}`))
    console.log()
  }

  // Info messages
  info(message: string, details?: string) {
    console.log(`\n${figures.info} ${chalk.hex(this.theme.info)(message)}`)
    if (details) {
      console.log(chalk.hex(this.theme.muted)(`  ${details}`))
    }
    console.log()
  }

  // Service messages with colored labels
  service(serviceName: string, message: string, type: 'info' | 'error' | 'success' = 'info') {
    const colors = {
      info: this.theme.info,
      error: this.theme.error,
      success: this.theme.success,
    }

    const label = chalk.hex(colors[type]).bold(`[${serviceName}]`)
    console.log(`${label} ${message}`)
  }

  // Interactive spinners
  spinner(
    message: string,
    options?: {
      type?: 'dots' | 'pulse' | 'arrow3' | 'bouncingBar'
      color?: keyof UITheme
    }
  ) {
    const { type = 'dots', color = 'primary' } = options || {}

    // Map theme colors to Ora-compatible color names
    const oraColorMap = {
      primary: 'blue',
      secondary: 'magenta',
      success: 'green',
      warning: 'yellow',
      error: 'red',
      info: 'cyan',
      muted: 'gray',
    }

    const spinner = ora({
      text: message,
      spinner: type,
      color: oraColorMap[color] || 'blue',
    }).start()

    this.activeSpinners.add(spinner)

    return {
      text: (newText: string) => {
        spinner.text = newText
      },
      succeed: (text?: string) => {
        spinner.succeed(text)
        this.activeSpinners.delete(spinner)
      },
      fail: (text?: string) => {
        spinner.fail(text)
        this.activeSpinners.delete(spinner)
      },
      warn: (text?: string) => {
        spinner.warn(text)
        this.activeSpinners.delete(spinner)
      },
      stop: () => {
        spinner.stop()
        this.activeSpinners.delete(spinner)
      },
    }
  }

  // Feature boxes for major announcements
  box(
    content: string,
    options?: {
      title?: string
      borderStyle?: 'single' | 'double' | 'round' | 'bold'
      borderColor?: keyof UITheme
      align?: 'left' | 'center' | 'right'
    }
  ) {
    const {
      title,
      borderStyle = 'round',
      borderColor = 'primary',
      align = 'center',
    } = options || {}

    console.log(
      boxen(content, {
        title,
        titleAlignment: 'center',
        textAlignment: align,
        borderStyle,
        borderColor: this.theme[borderColor] || borderColor,
        padding: 1,
        margin: 1,
      })
    )
  }

  // Command palette style
  command(cmd: string, description: string) {
    const cmdFormatted = chalk.hex(this.theme.primary).bold(cmd)
    const descFormatted = chalk.hex(this.theme.muted)(description)
    console.log(`  ${cmdFormatted}  ${descFormatted}`)
  }

  // Subtle contextual messages
  subtle(message: string) {
    console.log(chalk.hex(this.theme.muted)(message))
  }

  // Quick one-liners
  log(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') {
    const methods = {
      success: this.success.bind(this),
      error: this.error.bind(this),
      warning: this.warning.bind(this),
      info: this.info.bind(this),
    }
    methods[type](message)
  }
}

// Singleton instance for consistent theming
export const ui = new CommonersUI()
