/**
 * Logger
 *
 * Provides logging to both console and file with timestamps and optional colors
 */

import { promises as fs } from 'fs'
import * as path from 'path'

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
  private logFile: string
  private onWarning?: (message: string) => void
  private onSkip?: (message: string) => void

  constructor(
    cacheDir: string,
    onWarning?: (message: string) => void,
    onSkip?: (message: string) => void,
  ) {
    this.logFile = path.join(cacheDir, 'import.log')
    this.onWarning = onWarning
    this.onSkip = onSkip
  }

  setWarningCallback(callback: (message: string) => void): void {
    this.onWarning = callback
  }

  setSkipCallback(callback: (message: string) => void): void {
    this.onSkip = callback
  }

  async log(message: string, options: LogOptions = {}): Promise<void> {
    const timestamp = new Date().toISOString()
    const logMessage = `[${timestamp}] ${message}\n`

    // Console output with optional color
    if (options.color) {
      console.log(`${colors[options.color]}${message}${colors.reset}`)
    } else {
      console.log(message)
    }

    // File output without colors
    await fs.appendFile(this.logFile, logMessage)
  }

  async error(message: string): Promise<void> {
    await this.log(`ERROR: ${message}`, { isError: true, color: 'red' })
  }

  async warn(message: string): Promise<void> {
    await this.log(`WARN: ${message}`, { color: 'yellow' })
    // Call the warning callback if set
    if (this.onWarning) {
      this.onWarning(message)
    }
  }

  async info(message: string): Promise<void> {
    await this.log(message, { color: 'cyan' })
  }

  async success(message: string): Promise<void> {
    await this.log(message, { color: 'green' })
  }

  async skip(message: string): Promise<void> {
    await this.log(`SKIP: ${message}`, { color: 'magenta' })
    // Call the skip callback if set
    if (this.onSkip) {
      this.onSkip(message)
    }
  }
}
