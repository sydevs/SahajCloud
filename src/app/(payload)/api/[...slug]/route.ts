/* THIS FILE WAS GENERATED AUTOMATICALLY BY PAYLOAD. */
/* DO NOT MODIFY IT BECAUSE IT COULD BE REWRITTEN AT ANY TIME. */
import config from '@payload-config'

import '@payloadcms/next/css'
import {
  REST_DELETE,
  REST_GET,
  REST_OPTIONS,
  REST_PATCH,
  REST_POST,
  REST_PUT,
} from '@payloadcms/next/routes'

import { withPayloadRouteScope } from '@/plugins/sentry/payloadRouteScope'

// ⚠ The wrapper is this repo's one edit to a generated file, and it has to be
// here: it marks a request as Payload-routed, so the Local API capture stands
// down and `afterError` stays the single reporter for a routed failure (#1039).
// Re-running Payload's generator drops it, and a 400 then reports twice.
export const GET = withPayloadRouteScope(REST_GET(config))
export const POST = withPayloadRouteScope(REST_POST(config))
export const DELETE = withPayloadRouteScope(REST_DELETE(config))
export const PATCH = withPayloadRouteScope(REST_PATCH(config))
export const PUT = withPayloadRouteScope(REST_PUT(config))
export const OPTIONS = withPayloadRouteScope(REST_OPTIONS(config))
