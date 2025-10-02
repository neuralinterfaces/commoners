/**
 * Structured logging system for Commoners
 * Replaces scattered console.log statements with consistent, filterable logging
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

export interface LogContext {
  component?: string
  operation?: string
  file?: string
  target?: string
  service?: string
  [key: string]: any
}

export interface LogEntry {
  level: LogLevel
  message: string
  context?: LogContext
  timestamp: Date
  error?: Error
}

export interface LoggerOptions {
  level?: LogLevel
  prefix?: string
  enableColors?: boolean
  onLog?: (entry: LogEntry) => void
}

// Set log level icons
const logLevelIcons: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: '🔍',
  [LogLevel.INFO]: 'ℹ️',
  [LogLevel.WARN]: '⚠️',
  [LogLevel.ERROR]: '❌',
  [LogLevel.SILENT]: '',
}

export class Logger {
  private level: LogLevel
  private prefix: string
  private enableColors: boolean
  private onLog?: (entry: LogEntry) => void
  private isChild: boolean

  constructor(options: LoggerOptions = {}, isChild = false) {
    this.isChild = isChild
    this.level = options.level ?? LogLevel.SILENT // Default to SILENT if not set (only user-configured logging)
    this.prefix = options.prefix ?? '[commoners]'
    this.enableColors = options.enableColors ?? true
    this.onLog = options.onLog
  }

  private getEffectiveLevel(): LogLevel {
    // Child loggers always check global level first
    if (this.isChild && globalLogLevel !== undefined) {
      return globalLogLevel
    }
    return this.level
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.getEffectiveLevel()
  }

  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString()
    const levelName = LogLevel[level]

    let formatted = `${this.prefix} ${timestamp} ${levelName}`

    if (context?.component) formatted += ` [${context.component}]`
    if (context?.operation) formatted += ` ${context.operation}`

    formatted += ` ${message}`

    // Add additional context as key-value pairs
    const extraContext = { ...context }
    delete extraContext.component
    delete extraContext.operation

    const contextKeys = Object.keys(extraContext)
    if (contextKeys.length > 0) {
      const contextStr = contextKeys
        .map(key => `${key}=${JSON.stringify(extraContext[key])}`)
        .join(' ')
      formatted += ` ${contextStr}`
    }

    return formatted
  }

  private emit(level: LogLevel, message: string, context?: LogContext, error?: Error) {
    if (!this.shouldLog(level)) return

    const entry: LogEntry = {
      level,
      message,
      context,
      timestamp: new Date(),
      error,
    }

    // Call custom log handler if provided
    if (this.onLog) {
      this.onLog(entry)
    }

    // Use global UI if available for formatted output
    const ui = globalUI

    // Helper to format context values compactly
    const formatValue = (v: any): string => {
      if (typeof v === 'string' && v.length > 60) {
        // Truncate long paths/strings with ellipsis in middle
        const start = v.substring(0, 30)
        const end = v.substring(v.length - 27)
        return `"${start}...${end}"`
      }
      return JSON.stringify(v)
    }

    if (ui) {
      const icon = logLevelIcons[level]

      // Use UI's indent system
      ui.pushIndent()
      // Add extra space after icon to ensure consistent alignment across emoji widths
      ui.add(`${icon}  ${message}`)

      // Add context as details if present
      if (context && Object.keys(context).length > 0) {
        const entries = Object.entries(context)
        const contextStr = entries.map(([k, v]) => `${k}=${formatValue(v)}`).join(' ')
        ui.details(contextStr)
      }

      ui.popIndent()
      ui.add()
      return
    }

    // Still output to console for development
    const formatted = this.formatMessage(level, message, context)

    switch (level) {
      case LogLevel.DEBUG:
        console.debug(formatted)
        break
      case LogLevel.INFO:
        console.info(formatted)
        break
      case LogLevel.WARN:
        console.warn(formatted)
        if (error) console.warn(error)
        break
      case LogLevel.ERROR:
        console.error(formatted)
        if (error) console.error(error)
        break
    }
  }

  debug(message: string, context?: LogContext) {
    this.emit(LogLevel.DEBUG, message, context)
  }

  info(message: string, context?: LogContext) {
    this.emit(LogLevel.INFO, message, context)
  }

  warn(message: string, context?: LogContext, error?: Error) {
    this.emit(LogLevel.WARN, message, context, error)
  }

  error(message: string, context?: LogContext, error?: Error) {
    this.emit(LogLevel.ERROR, message, context, error)
  }

  /**
   * Create a child logger with additional context
   */
  child(context: LogContext): Logger {
    return new Logger({
      level: this.level,
      prefix: this.prefix,
      enableColors: this.enableColors,
      onLog: (entry) => {
        // Merge parent and child context
        const mergedEntry = {
          ...entry,
          context: { ...context, ...entry.context },
        }
        if (this.onLog) this.onLog(mergedEntry)
      },
    }, true)  // Mark as child so it checks global level
  }

  /**
   * Set the log level at runtime
   */
  setLevel(level: LogLevel) {
    this.level = level
  }
}

// Global logger instance, level, and UI
let globalLogger: Logger
let globalLogLevel: LogLevel | undefined
let globalUI: any | undefined

/**
 * Get or create the global logger instance
 */
export function getLogger(): Logger {
  if (!globalLogger) {
    globalLogger = new Logger({ level: globalLogLevel })
  }
  return globalLogger
}

/**
 * Configure the global logger
 */
export function configureLogger(options: LoggerOptions) {
  if (options.level !== undefined) {
    globalLogLevel = options.level
  }
  globalLogger = new Logger(options)
  return globalLogger
}

/**
 * Set the global log level for all loggers
 */
export function setGlobalLogLevel(level: LogLevel) {
  globalLogLevel = level
  if (globalLogger) {
    globalLogger.setLevel(level)
  }
  // Child loggers will automatically use this global level since they check it dynamically
}

/**
 * Create a component-specific logger
 */
export function createLogger(component: string): Logger {
  return getLogger().child({ component })
}

/**
 * Set the global UI instance for formatted logging output
 */
export function setGlobalUI(ui: any) {
  globalUI = ui
}

/**
 * Get the global UI instance
 */
export function getGlobalUI() {
  return globalUI
}
