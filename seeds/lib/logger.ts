/**
 * Logger
 *
 * Provides console logging with optional colors.
 * Simplified for document-centric progress reporting.
 */

/* eslint-disable no-console */

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
}

export type LogColor = keyof typeof colors

export interface LogOptions {
  isError?: boolean
  color?: LogColor
}

export class Logger {
  async log(message: string, options: LogOptions = {}): Promise<void> {
    if (options.color) {
      console.log(`${colors[options.color]}${message}${colors.reset}`)
    } else {
      console.log(message)
    }
  }

  async error(message: string): Promise<void> {
    await this.log(`ERROR: ${message}`, { isError: true, color: 'red' })
  }

  async warn(message: string): Promise<void> {
    await this.log(`WARN: ${message}`, { color: 'yellow' })
  }

  async info(message: string): Promise<void> {
    await this.log(message, { color: 'cyan' })
  }

  async success(message: string): Promise<void> {
    await this.log(message, { color: 'green' })
  }

  async skip(message: string): Promise<void> {
    await this.log(`SKIP: ${message}`, { color: 'magenta' })
  }
}
