/**
 * The tags both capture bodies send, shared so neither can spell one
 * differently.
 *
 * ⚠ **The `environment` tag is not the event's `environment` field.** The field
 * is what Sentry's environment selector and its alert rules read, and
 * `Sentry.init` sets it on every event; this is the searchable copy beside it.
 *
 * ⚠ **Server-side only.** `deploymentEnvironment` reads the environment at run
 * time, which a browser bundle cannot — there `Sentry.init` carries
 * `clientDeploymentEnvironment()` instead (#733).
 */
import { deploymentEnvironment } from '@/lib/env/deploymentEnvironment'

/** A tag is a non-empty string or absent: Sentry has no use for `null` or `''`. */
export const captureTags = (record?: Record<string, unknown>): Record<string, string> =>
  Object.fromEntries(
    Object.entries({ environment: deploymentEnvironment(), ...record }).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== '',
    ),
  )
