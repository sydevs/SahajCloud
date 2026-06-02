import type { Config } from 'payload'

/**
 * Worker-safe logger used by Payload in every environment.
 *
 * Why this exists:
 * - Payload expects a Pino-compatible logger shape.
 * - Pino's default destination ultimately writes through fs-backed transports.
 * - In Cloudflare Workers, Node compatibility around those write paths can fail on
 *   string encodings such as `fs.write(fd, value, 'utf8')`.
 *
 * How it works:
 * - It implements the subset of the Pino logger interface that Payload and this repo use.
 * - It routes all log output to `console`, which is reliable in Workers and local Node.
 * - It keeps `child()` bindings and normalizes `Error` instances into plain objects so
 *   logs stay readable in JSON-like console output.
 */

type LogArgument = unknown
type LogBindings = Record<string, unknown>

export type WorkerSafeLogLevel =
  | 'silent'
  | 'fatal'
  | 'error'
  | 'warn'
  | 'info'
  | 'debug'
  | 'trace'

type LoggerMethod = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'

const LOG_LEVEL_PRIORITY: Record<WorkerSafeLogLevel, number> = {
  silent: 0,
  fatal: 1,
  error: 2,
  warn: 3,
  info: 4,
  debug: 5,
  trace: 6,
}

const CONSOLE_METHODS: Record<LoggerMethod, keyof Console> = {
  trace: 'log',
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
  fatal: 'error',
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return Object.prototype.toString.call(value) === '[object Object]'
}

const isWorkerSafeLogLevel = (value: string): value is WorkerSafeLogLevel => {
  return value in LOG_LEVEL_PRIORITY
}

const normalizeLogValue = (value: unknown): unknown => {
  if (value instanceof Error) {
    const serializedError: Record<string, unknown> = {
      name: value.name,
      message: value.message,
      stack: value.stack,
    }

    if ('cause' in value && value.cause !== undefined) {
      serializedError.cause = normalizeLogValue(value.cause)
    }

    return serializedError
  }

  if (Array.isArray(value)) {
    return value.map(normalizeLogValue)
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, normalizeLogValue(nestedValue)]),
    )
  }

  return value
}

const shouldLog = (configuredLevel: WorkerSafeLogLevel, method: LoggerMethod): boolean => {
  return LOG_LEVEL_PRIORITY[configuredLevel] >= LOG_LEVEL_PRIORITY[method]
}

const mergeBindings = (bindings: LogBindings, args: LogArgument[]): LogArgument[] => {
  if (Object.keys(bindings).length === 0) {
    return args
  }

  if (args.length === 0) {
    return [bindings]
  }

  const [firstArg, ...restArgs] = args

  if (isPlainObject(firstArg)) {
    return [{ ...bindings, ...firstArg }, ...restArgs]
  }

  return [bindings, firstArg, ...restArgs]
}

export const createWorkerSafeLogger = (
  initialLevel: WorkerSafeLogLevel = 'info',
  initialBindings: LogBindings = {},
): Config['logger'] => {
  const state: {
    bindings: LogBindings
    level: WorkerSafeLogLevel
  } = {
    bindings: { ...initialBindings },
    level: initialLevel,
  }

  const write = (method: LoggerMethod, args: LogArgument[]) => {
    if (!shouldLog(state.level, method)) {
      return
    }

    const consoleMethod = CONSOLE_METHODS[method]
    const normalizedArgs = mergeBindings(state.bindings, args.map(normalizeLogValue))

    // eslint-disable-next-line no-console
    ;(console[consoleMethod] as (...consoleArgs: LogArgument[]) => void)(...normalizedArgs)
  }

  const logger = {
    msgPrefix: '',
    silent: () => {},
    trace: (...args: LogArgument[]) => write('trace', args),
    debug: (...args: LogArgument[]) => write('debug', args),
    info: (...args: LogArgument[]) => write('info', args),
    warn: (...args: LogArgument[]) => write('warn', args),
    error: (...args: LogArgument[]) => write('error', args),
    fatal: (...args: LogArgument[]) => write('fatal', args),
    child: (childBindings: LogBindings = {}) =>
      createWorkerSafeLogger(state.level, { ...state.bindings, ...childBindings }),
    bindings: () => ({ ...state.bindings }),
    setBindings: (nextBindings: LogBindings) => {
      Object.assign(state.bindings, nextBindings)
    },
    flush: () => {},
    isLevelEnabled: (level: string) => {
      return isWorkerSafeLogLevel(level) && level !== 'silent' && shouldLog(state.level, level)
    },
  }

  Object.defineProperty(logger, 'level', {
    enumerable: true,
    get: () => state.level,
    set: (nextLevel: string) => {
      if (isWorkerSafeLogLevel(nextLevel)) {
        state.level = nextLevel
      }
    },
  })

  return logger as unknown as Config['logger']
}
