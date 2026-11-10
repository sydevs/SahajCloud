/**
 * The tags every capture this service sends carries, with the deployment
 * attached.
 *
 * Shared so one capture body cannot report a deployment another leaves
 * untagged: a report with no `environment` cannot be filtered beside the ones
 * it sits next to in Sentry, and a PR preview's own events then read as
 * production's (#733).
 */
import { deploymentEnvironment } from '@/lib/env/deploymentEnvironment'

/** A tag is a non-empty string or absent: Sentry has no use for `null` or `''`. */
export const captureTags = (record?: Record<string, unknown>): Record<string, string> =>
  Object.fromEntries(
    Object.entries({ environment: deploymentEnvironment(), ...record }).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== '',
    ),
  )
