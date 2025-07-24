export interface ImportResult {
  success: boolean
  imported: number
  failed: number
  errors: ImportError[]
}

export interface ImportError {
  row: number
  field?: string
  message: string
  data?: Record<string, any>
}

export interface ImportOptions {
  dryRun?: boolean
  validateOnly?: boolean
  batchSize?: number
  onProgress?: (current: number, total: number) => void
}

export interface ValidationRule {
  field: string
  required?: boolean
  type?: 'string' | 'number' | 'boolean' | 'date' | 'email' | 'url'
  minLength?: number
  maxLength?: number
  min?: number
  max?: number
  pattern?: RegExp
  custom?: (value: any, data: Record<string, any>) => string | null
}

export interface CollectionImportConfig {
  collection: string
  validationRules: ValidationRule[]
  transform?: (data: Record<string, any>) => Record<string, any>
  beforeImport?: (data: Record<string, any>) => Promise<Record<string, any>>
}