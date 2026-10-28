/**
 * Whether a Payload REST or GraphQL route is handling the current request.
 *
 * `routeError` reports every throw a routed request produces, through the root
 * `afterError` hook. The Local API capture (#1039) must stand down inside one,
 * or a write our own collection hooks make while a request is in flight reports
 * the same failure the hook is about to report.
 *
 * ⚠ **Lexical, never timing.** The flag is set by the route handlers this repo
 * exports and read through the async context Node carries down the await chain.
 * Nothing here infers "a route is probably running" from a clock.
 *
 * ⚠ **Do not read this to decide whether to answer a request.** It says only
 * who owns the error report. An operation outside a route is an ordinary
 * operation.
 */
import { AsyncLocalStorage } from 'node:async_hooks'

const handlingPayloadRoute = new AsyncLocalStorage<true>()

/**
 * Wrap a Payload route handler so every operation beneath it reads as routed.
 */
export const withPayloadRouteScope = <Args extends unknown[], Result>(
  handler: (...args: Args) => Result,
): ((...args: Args) => Result) => {
  return (...args: Args) => handlingPayloadRoute.run(true, () => handler(...args))
}

export const isHandlingPayloadRoute = (): boolean => handlingPayloadRoute.getStore() === true
