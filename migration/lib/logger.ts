/**
 * Logger
 *
 * Provides logging to both console and file with timestamps
 */

import { promises as fs } from 'fs'
import * as path from 'path'

export class Logger {
  private logFile: string

  constructor(cacheDir: string) {
    this.logFile = path.join(cacheDir, 'import.log')
  }

  async log(message: string, isError = false): Promise<void> {
    const timestamp = new Date().toISOString()
    const logMessage = `[${timestamp}] ${message}\n`
    console.log(message)
    await fs.appendFile(this.logFile, logMessage)
  }

  async error(message: string): Promise<void> {
    await this.log(`ERROR: ${message}`, true)
  }

  async warn(message: string): Promise<void> {
    await this.log(`WARN: ${message}`)
  }

  async info(message: string): Promise<void> {
    await this.log(message)
  }
}
