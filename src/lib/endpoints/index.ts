// Shared helpers for the public client endpoints — request auth, query parsing,
// and the empty-list envelope. These collapse boilerplate repeated across the
// `for-user` / `for-audience` / meditation sub-endpoints. This is distinct from
// the "no shared endpoints barrel" rule in `src/endpoints/AGENTS.md`, which
// governs endpoint *definitions* (those stay colocated with their collection).

export { commaSeparatedIntIds } from './commaSeparatedIntIds'
export { emptyPaginatedResponse } from './emptyPaginatedResponse'
export { parseBody } from './parseBody'
export { parseQuery, type ParseQueryResult } from './parseQuery'
export { requireActiveClient } from './requireActiveClient'
export { requireActiveManager } from './requireActiveManager'
