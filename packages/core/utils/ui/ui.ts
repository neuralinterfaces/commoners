/* eslint-disable no-console */
// Modern CLI UI Library for Commoners
// Provides rich, interactive styling decoupled from core functionality

import { Ora } from 'ora'
import { createRequire } from 'node:module'
import { defaultTheme, getTheme, UITheme } from './themes.js'

interface SectionContext {
  title: string
  subtitle?: string
  level: number
  items: string[]
  boxed?: boolean
  contentLines?: string[]
  boxStartLine?: number
  boxWidth?: number
}

export class CommonersUI {
  private theme: UITheme = structuredClone(defaultTheme)
  private activeSpinners: Set<Ora> = new Set()
  private sectionStack: SectionContext[] = []

  constructor(theme: Partial<UITheme> | string = {}) {

    if (typeof theme === 'string') this.theme = getTheme(theme)
    else if (typeof theme === 'object' && theme !== null) this.theme = { ...defaultTheme, ...theme } // Merge provided theme with default theme
    
    // Cleanup spinners on exit
    const require = createRequire(import.meta.url)
    this._chalk = require('chalk').default // Ensure compatibility with both ESM and CJS
    this._ora = require('ora').default // Ensure compatibility with both ESM and CJS
    this._boxen = require('boxen').default // Ensure compatibility with both ESM and CJS
    this._figures = require('figures').default // Ensure compatibility with both ESM and CJS


    process.on('exit', () => this.cleanup())
    process.on('SIGINT', () => this.cleanup())
  }

  private cleanup() {
    this.activeSpinners.forEach(spinner => {
      if (spinner.isSpinning) spinner.stop()
    })
    this.activeSpinners.clear()
  }

  // Helper method to strip ANSI codes for accurate text length calculation
  private stripAnsi(text: string): string {
    // More comprehensive ANSI escape sequence removal
    return text.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '')
  }

  // Helper method to wrap text while preserving ANSI codes
  private wrapText(text: string, maxWidth: number): string[] {
    const lines: string[] = []
    let currentLine = ''
    let currentLength = 0

    // Split by words while preserving ANSI codes
    const words = text.split(' ')

    for (const word of words) {
      const cleanWord = this.stripAnsi(word)
      const wordLength = cleanWord.length

      // Check if adding this word would exceed the line width
      const spaceNeeded = currentLine ? 1 : 0 // space before word if not first word

      if (currentLength + spaceNeeded + wordLength > maxWidth) {
        // Current line would overflow, start a new line
        if (currentLine) {
          lines.push(currentLine)
        }

        // Handle very long words that don't fit on a single line
        if (wordLength > maxWidth) {
          // Split the word, preserving ANSI codes as much as possible
          let remainingWord = word
          while (remainingWord.length > 0) {
            const cleanRemaining = this.stripAnsi(remainingWord)
            if (cleanRemaining.length <= maxWidth) {
              lines.push(remainingWord)
              break
            } else {
              // Find a good break point
              let breakPoint = maxWidth
              // Try to break at a reasonable point, avoiding breaking ANSI sequences
              while (breakPoint > 0 && remainingWord[breakPoint] === '\u001b') {
                breakPoint--
              }
              if (breakPoint === 0) breakPoint = maxWidth

              lines.push(remainingWord.substring(0, breakPoint))
              remainingWord = remainingWord.substring(breakPoint)
            }
          }
          currentLine = ''
          currentLength = 0
        } else {
          // Word fits on new line
          currentLine = word
          currentLength = wordLength
        }
      } else {
        // Word fits on current line
        if (currentLine) {
          currentLine += ' ' + word
          currentLength += 1 + wordLength
        } else {
          currentLine = word
          currentLength = wordLength
        }
      }
    }

    if (currentLine) {
      lines.push(currentLine)
    }

    return lines.length > 0 ? lines : ['']
  }

  // Enhanced Headers
  header(message: string, options?: { subtitle?: string }) {
    const { subtitle } = options || {}
    const title = this._chalk.hex(this.theme.primary).bold(message)
    this.add('\n' + title)
    if (subtitle) this.add(this._chalk.hex(this.theme.muted)(subtitle))
    this.add()
  }
  
  sectionHeader(message: string, options?: { subtitle?: string }) {
    const { subtitle } = options || {}
    const title = this._chalk.hex(this.theme.secondary).bold(message)
    this.add('\n' + this._chalk.underline(title))
    if (subtitle) this.add(this._chalk.hex(this.theme.muted)(subtitle))
    this.add()
  }

  // Section Context Management
  pushSection(title: string, options?: { subtitle?: string; boxed?: boolean }) {
    const level = this.sectionStack.length
    const section: SectionContext = {
      title,
      subtitle: options?.subtitle,
      level,
      items: [],
      boxed: options?.boxed,
      contentLines: []
    }

    this.sectionStack.push(section)

    if (options?.boxed) {
      // Calculate box width
      const terminalWidth = process.stdout.columns || 80
      const boxWidth = Math.max(60, terminalWidth - 4)
      section.boxWidth = boxWidth

      // Render box header
      this.renderBoxHeader(title, options?.subtitle, boxWidth)
    } else {
      // Display section header with proper indentation
      const indent = '  '.repeat(level)
      const formattedTitle = this._chalk.hex(this.theme.secondary).bold(title)
      console.log(`\n${indent}${this._chalk.underline(formattedTitle)}`)
      if (options?.subtitle) {
        console.log(`${indent}${this._chalk.hex(this.theme.muted)(options.subtitle)}`)
      }
      this.add()
    }

    return section
  }

  private renderBoxHeader(title: string, subtitle?: string, boxWidth?: number) {
    const width = boxWidth || Math.max(60, (process.stdout.columns || 80) - 4)
    const padding = 2
    const contentWidth = width - 2 - (padding * 2) // Account for borders and padding

    // Top border
    const topBorder = '╭' + '─'.repeat(width - 2) + '╮'
    console.log(' ' + topBorder)

    // Empty line
    console.log(' │' + ' '.repeat(width - 2) + '│')

    // Title line
    const titleText = this._chalk.hex(this.theme.secondary).bold(title)
    const createLine = (text) => ' │' + this.padToWidth(text, contentWidth, padding) + '│'
    console.log(createLine(titleText))
    console.log(createLine(''))
    
    // Subtitle if provided
    if (subtitle) {
      const subtitleText = this._chalk.hex(this.theme.muted)(subtitle)
      const subtitleLine = this.padToWidth(subtitleText, contentWidth, padding)
      console.log(' │' + subtitleLine + '│')
    }
  }

  private renderBoxContent(content: string | string[], boxWidth?: number) {
    const width = boxWidth || Math.max(60, (process.stdout.columns || 80) - 4)
    const padding = 2
    const contentWidth = width - 2 - (padding * 2)

    // Handle both string and array input
    const contentLines = Array.isArray(content) ? content : content.split('\n')

    // Process each line and wrap as needed
    const allLines: string[] = []
    contentLines.forEach(line => {
      // Wrap each individual line to ensure it fits properly
      const wrappedLines = this.wrapText(line, contentWidth)
      allLines.push(...wrappedLines)
    })

    // Render all processed lines
    allLines.forEach(line => {
      // Double-check that each line fits within the content width
      const cleanLine = this.stripAnsi(line)
      if (cleanLine.length > contentWidth) {
        // If line is still too long, truncate it as last resort
        const truncated = line.substring(0, contentWidth - 3) + '...'
        const contentLine = this.padToWidth(truncated, contentWidth, padding)
        console.log(' │' + contentLine + '│')
      } else {
        const contentLine = this.padToWidth(line, contentWidth, padding)
        console.log(' │' + contentLine + '│')
      }
    })
  }

  private renderBoxFooter(boxWidth?: number) {
    const width = boxWidth || Math.max(60, (process.stdout.columns || 80) - 4)

    // Empty line
    console.log(' │' + ' '.repeat(width - 2) + '│')

    // Bottom border
    const bottomBorder = '╰' + '─'.repeat(width - 2) + '╯'
    console.log(' ' + bottomBorder)
    this.add()
  }

  private padToWidth(text: string, contentWidth: number, padding: number): string {
    const paddingStr = ' '.repeat(padding)
    // Remove all ANSI escape sequences for accurate length calculation
    const cleanText = this.stripAnsi(text)
    const remainingSpace = Math.max(0, contentWidth - cleanText.length)
    return paddingStr + text + ' '.repeat(remainingSpace) + paddingStr
  }

  popSection() {
    const section = this.sectionStack.pop()
    if (section) {
      if (section.boxed) {
        // Render the box footer to close the live box
        this.renderBoxFooter(section.boxWidth)
      } else if (section.items.length > 0) {
        // Optional: Display section summary or completion
        const indent = '  '.repeat(section.level)
        console.log(`${indent}${this._chalk.hex(this.theme.muted)(`└─ ${section.items.length} items processed`)}\n`)
      }
    }
    return section
  }

  getCurrentSection(): SectionContext | undefined {
    return this.sectionStack[this.sectionStack.length - 1]
  }

  // Convenience method for boxed sections
  pushBoxedSection(title: string, options?: { subtitle?: string }) {
    return this.pushSection(title, { ...options, boxed: true })
  }

  private addToCurrentSection(message: string | string[]) {
    const currentSection = this.getCurrentSection()
    if (currentSection) {
      const messageStr = Array.isArray(message) ? message.join('\n') : message
      currentSection.items.push(messageStr)
      if (currentSection.boxed) {
        // Render content immediately within the box
        this.renderBoxContent(message, currentSection.boxWidth)
      }
    }
  }

  private formatWithSectionContext(message: string): string {
    const currentSection = this.getCurrentSection()
    if (currentSection) {
      if (currentSection.boxed) {
        // For boxed sections, don't return formatted text since we handle it in addToCurrentSection
        return ''
      } else {
        const indent = '  '.repeat(currentSection.level + 1)
        return `${indent}${message}`
      }
    }
    return message
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
      ios: 'iOS'
    }

    const lower = targetName.toLowerCase()
    const color = colors[lower] || this.theme.primary
    const title = titled[lower] || targetName.charAt(0).toUpperCase() + targetName.slice(1)

    // Return plain text if requested, or use chalk for coloring
    return plain ? title : `${this._chalk.hex(color).bold(title)}`
  }

  // Success messages with celebration
  success(message: string, details?: string) {
    const currentSection = this.getCurrentSection()
    const fullMessage = `${this._figures.tick} ${this._chalk.hex(this.theme.success).bold(message)}`

    if (currentSection?.boxed) {
      // Render content immediately in the live box
      this.addToCurrentSection(fullMessage)
      if (details) {
        this.addToCurrentSection(this._chalk.hex(this.theme.muted)(`  ${details}`))
      }
    } else {
      // Render immediately for non-boxed sections
      const formattedMessage = this.formatWithSectionContext(fullMessage)
      console.log(`\n${formattedMessage}`)
      if (details) {
        const formattedDetails = this.formatWithSectionContext(this._chalk.hex(this.theme.muted)(`  ${details}`))
        console.log(formattedDetails)
      }
      this.addToCurrentSection(message)
      this.add()
    }
  }

  // Enhanced error messages
  error(message: string, details?: string) {
    const currentSection = this.getCurrentSection()
    const fullMessage = `${this._figures.cross} ${this._chalk.hex(this.theme.error).bold(message)}`

    if (currentSection?.boxed) {
      // Render content immediately in the live box
      this.addToCurrentSection(fullMessage)
      if (details) {
        this.addToCurrentSection(this._chalk.hex(this.theme.muted)(`  ${details}`))
      }
    } else {
      // Render immediately for non-boxed sections
      const formattedMessage = this.formatWithSectionContext(fullMessage)
      console.log(`\n${formattedMessage}`)
      if (details) {
        const formattedDetails = this.formatWithSectionContext(this._chalk.hex(this.theme.muted)(`  ${details}`))
        console.log(formattedDetails)
      }
      this.addToCurrentSection(message)
      this.add()
    }
  }

  // Warning messages
  warning(message: string, details?: string) {
    const currentSection = this.getCurrentSection()
    const fullMessage = `${this._figures.warning} ${this._chalk.hex(this.theme.warning)(message)}`

    if (currentSection?.boxed) {
      // Render content immediately in the live box
      this.addToCurrentSection(fullMessage)
      if (details) {
        this.addToCurrentSection(this._chalk.hex(this.theme.muted)(`  ${details}`))
      }
    } else {
      // Render immediately for non-boxed sections
      const formattedMessage = this.formatWithSectionContext(fullMessage)
      console.log(`\n${formattedMessage}`)
      if (details) {
        const formattedDetails = this.formatWithSectionContext(this._chalk.hex(this.theme.muted)(`  ${details}`))
        console.log(formattedDetails)
      }
      this.addToCurrentSection(message)
      this.add()
    }
  }

  // Info messages
  info(message: string, details?: string) {
    const currentSection = this.getCurrentSection()
    const fullMessage = `${this._figures.info} ${this._chalk.hex(this.theme.info)(message)}`

    if (currentSection?.boxed) {
      // Render content immediately in the live box
      this.addToCurrentSection(fullMessage)
      if (details) {
        this.addToCurrentSection(this._chalk.hex(this.theme.muted)(`  ${details}`))
      }
    } else {
      // Render immediately for non-boxed sections
      const formattedMessage = this.formatWithSectionContext(fullMessage)
      this.add(`\n${formattedMessage}`)
      if (details) {
        const formattedDetails = this.formatWithSectionContext(this._chalk.hex(this.theme.muted)(`  ${details}`))
        this.add(formattedDetails)
      }
      this.addToCurrentSection(message)
      this.add()
    }
  }

  details(message: string) {
    const currentSection = this.getCurrentSection()
    const fullMessage = this._chalk.hex(this.theme.muted)(message)

    if (currentSection?.boxed) {
      // Render content immediately in the live box
      this.addToCurrentSection(fullMessage)
    } else {
      // Render immediately for non-boxed sections
      const formattedMessage = this.formatWithSectionContext(fullMessage)
      this.add(formattedMessage)
      this.addToCurrentSection(message)
    }
  }

  // Service messages with colored labels
  service(serviceName: string, message: string, type: 'info' | 'error' | 'success' = 'info') {

    const currentSection = this.getCurrentSection()
    const colors = {
      info: this.theme.info,
      error: this.theme.error,
      success: this.theme.success,
    }


    if (!serviceName) {
      if (currentSection?.boxed) {
        this.addToCurrentSection(message)
      } else {
        const formattedMessage = this.formatWithSectionContext(message)
        this.add(formattedMessage)
        this.addToCurrentSection(message)
      }
      return
    }

    const label = this._chalk.hex(colors[type]).bold(`[${serviceName}]`)
    const fullMessage = `${label} ${message}`

    if (currentSection?.boxed) {
      // Render content immediately in the live box
      this.addToCurrentSection(fullMessage)
    } else {
      // Render immediately for non-boxed sections
      const formattedMessage = this.formatWithSectionContext(fullMessage)
      this.add(formattedMessage)
      this.addToCurrentSection(`[${serviceName}] ${message}`)
    }
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

    const spinner = this._ora({
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

    const terminalWidth = process.stdout.columns || 80
    const boxWidth = Math.max(terminalWidth - 4, 60) // Ensure minimum width
    const leftMargin = Math.floor((terminalWidth - boxWidth) / 2)

    console.log(
      this._boxen(content, {
        title,
        titleAlignment: 'center',
        textAlignment: align,
        borderStyle,
        borderColor: this.theme[borderColor] || borderColor,
        padding: 1,
        margin: { left: leftMargin, right: 0, top: 1, bottom: 1 },
        width: boxWidth,
      })
    )
  }

  // Command palette style
  command(cmd: string, description: string) {
    const cmdFormatted = this._chalk.hex(this.theme.primary).bold(cmd)
    const descFormatted = this._chalk.hex(this.theme.muted)(description)
    this.add(`  ${cmdFormatted}  ${descFormatted}`)
  }

  // Subtle contextual messages
  subtle(message: string) {
    this.add(this._chalk.hex(this.theme.muted)(message))
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

  add(...args: string[]) {
    const currentSection = this.getCurrentSection()
    const message = args.join(' ')

    if (currentSection) {
      if (currentSection.boxed) {
        // Render content immediately in the live box
        this.addToCurrentSection(message)
      } else {
        const formattedMessage = this.formatWithSectionContext(message)
        console.log(formattedMessage)
        this.addToCurrentSection(message)
      }
    } else {
      console.log(message)
    }
  }

  // Add multi-line content to the current section (especially useful for boxed sections)
  addLines(lines: string[]) {
    const currentSection = this.getCurrentSection()

    if (currentSection) {
      if (currentSection.boxed) {
        // Render content immediately in the live box
        this.addToCurrentSection(lines)
      } else {
        lines.forEach(line => {
          const formattedMessage = this.formatWithSectionContext(line)
          console.log(formattedMessage)
        })
        this.addToCurrentSection(lines)
      }
    } else {
      lines.forEach(line => console.log(line))
    }
  }
}
