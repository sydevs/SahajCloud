/**
 * State Manager
 *
 * Handles saving and loading import state for resumability
 */

import { promises as fs } from 'fs'
import * as path from 'path'

export interface ImportState {
  lastUpdated: string
  phase: string
  itemsCreated: Record<string, string>
  failed: string[]
}

export class StateManager {
  private stateFile: string
  private state: ImportState

  constructor(cacheDir: string) {
    this.stateFile = path.join(cacheDir, 'import-state.json')
    this.state = {
      lastUpdated: new Date().toISOString(),
      phase: 'initializing',
      itemsCreated: {},
      failed: [],
    }
  }

  getState(): ImportState {
    return this.state
  }

  setState(state: Partial<ImportState>): void {
    this.state = { ...this.state, ...state }
  }

  setPhase(phase: string): void {
    this.state.phase = phase
  }

  addItemCreated(key: string, id: string): void {
    this.state.itemsCreated[key] = id
  }

  hasItemCreated(key: string): boolean {
    return key in this.state.itemsCreated
  }

  addFailed(message: string): void {
    this.state.failed.push(message)
  }

  async save(): Promise<void> {
    this.state.lastUpdated = new Date().toISOString()
    await fs.writeFile(this.stateFile, JSON.stringify(this.state, null, 2))
  }

  async load(): Promise<boolean> {
    try {
      const data = await fs.readFile(this.stateFile, 'utf-8')
      this.state = JSON.parse(data)
      return true
    } catch {
      return false
    }
  }

  async reset(): Promise<void> {
    this.state = {
      lastUpdated: new Date().toISOString(),
      phase: 'initializing',
      itemsCreated: {},
      failed: [],
    }
    await this.save()
  }
}
