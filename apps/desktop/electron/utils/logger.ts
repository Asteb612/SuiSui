/**
 * Logger utility for Electron main process
 * Provides structured logging with levels and context
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

interface LogEntry {
  timestamp: string
  level: LogLevel
  context: string
  message: string
  data?: unknown
  error?: Error
}

class Logger {
  private minLevel: LogLevel
  private context: string

  constructor(context: string = 'App', minLevel: LogLevel = LogLevel.INFO) {
    this.context = context
    this.minLevel = process.env.NODE_ENV === 'production' ? LogLevel.WARN : minLevel
  }

  private formatTimestamp(): string {
    return new Date().toISOString()
  }

  private formatLevel(level: LogLevel): string {
    const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR']
    return levels[level]?.padEnd(5) || 'UNKNOWN'
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.minLevel
  }

  private log(level: LogLevel, message: string, data?: unknown, error?: Error): void {
    if (!this.shouldLog(level)) return

    const entry: LogEntry = {
      timestamp: this.formatTimestamp(),
      level,
      context: this.context,
      message,
      data,
      error,
    }

    const prefix = `[${entry.timestamp}] [${this.formatLevel(level)}] [${this.context}]`
    const logMessage = `${prefix} ${message}`

    switch (level) {
      case LogLevel.DEBUG:
        console.debug(logMessage, data ? JSON.stringify(data, null, 2) : '', error || '')
        break
      case LogLevel.INFO:
        console.info(logMessage, data ? JSON.stringify(data, null, 2) : '')
        break
      case LogLevel.WARN:
        console.warn(logMessage, data ? JSON.stringify(data, null, 2) : '', error || '')
        break
      case LogLevel.ERROR:
        console.error(logMessage, data ? JSON.stringify(data, null, 2) : '', error || '')
        if (error) {
          console.error('Stack trace:', error.stack)
        }
        break
    }
  }

  debug(message: string, data?: unknown): void {
    this.log(LogLevel.DEBUG, message, data)
  }

  info(message: string, data?: unknown): void {
    this.log(LogLevel.INFO, message, data)
  }

  warn(message: string, data?: unknown, error?: Error): void {
    this.log(LogLevel.WARN, message, data, error)
  }

  error(message: string, error?: Error, data?: unknown): void {
    this.log(LogLevel.ERROR, message, data, error)
  }

  child(context: string): Logger {
    return new Logger(`${this.context}:${context}`, this.minLevel)
  }
}

// Create default logger instance
export const logger = new Logger('App', LogLevel.INFO)

// Export factory function for creating context-specific loggers
export function createLogger(context: string, minLevel: LogLevel = LogLevel.INFO): Logger {
  return new Logger(context, minLevel)
}
