import type { CollectionSlug, Payload, Where } from 'payload'

/**
 * Make an admin form open on one tab the next time its owner opens it.
 *
 * Payload has no URL for a tab. It remembers the last one each user opened,
 * per document, as a preference: key `collection-<slug>-<id>`, value
 * `{ fields: { '_index-<n>': { tabIndex } } }`, where `n` is the tabs field's
 * position among the collection's top-level fields. Writing that preference
 * before the redirect is what lets a link land on a tab.
 *
 * ⚠ **Payload's own storage shape, not an API.** Read off the admin on
 * Payload 3.86 (clicking a tab writes exactly this), and pinned by
 * `manager-invite.int.spec.ts`, which follows the link and reads the row back.
 * If a Payload upgrade changes it, that spec fails rather than the link quietly
 * landing on the first tab.
 *
 * Returns without writing when the collection has no such tab — the landing
 * still works, on the default tab.
 */
export async function seedTabPreference({
  collection,
  payload,
  tab,
  userId,
}: {
  collection: CollectionSlug
  payload: Payload
  tab: string
  userId: number | string
}): Promise<void> {
  const fields = payload.collections[collection]?.config.fields ?? []
  const position = fields.findIndex((field) => field.type === 'tabs')
  const tabsField = fields[position]
  if (!tabsField || tabsField.type !== 'tabs') return

  const tabIndex = tabsField.tabs.findIndex((candidate) =>
    [candidate.label, 'name' in candidate ? candidate.name : undefined].includes(tab),
  )
  if (tabIndex < 0) return

  const key = `collection-${collection}-${userId}`
  const fieldKey = `_index-${position}`
  const where: Where = {
    and: [
      { key: { equals: key } },
      { 'user.relationTo': { equals: collection } },
      { 'user.value': { equals: userId } },
    ],
  }

  const stored = await payload.db.findOne<{
    id: number | string
    value?: { fields?: Record<string, object> }
  }>({
    collection: 'payload-preferences',
    where,
  })
  const existing = stored?.value
  const value = {
    ...existing,
    fields: { ...existing?.fields, [fieldKey]: { ...existing?.fields?.[fieldKey], tabIndex } },
  }

  // How Payload's own preference update writes it (`preferences/operations/
  // update.js`): an adapter upsert, since the collection's `user` field will
  // not validate a write made on someone's behalf.
  await payload.db.upsert({
    collection: 'payload-preferences',
    data: { key, user: { relationTo: collection, value: userId }, value },
    where,
  })
}
