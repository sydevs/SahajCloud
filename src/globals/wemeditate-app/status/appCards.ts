import type { Where } from 'payload'

import { labelOf, type DocumentReport, type SectionSpec } from '@/lib/status'

import { appCardChecks, type WeMeditateAppStatusConfig } from './shared'

interface Ctx {
  launchCriticalDocs: DocumentReport[]
  otherDocs: DocumentReport[]
}

export const appCardsSection: SectionSpec<WeMeditateAppStatusConfig, Ctx> = {
  key: 'appCards',
  label: 'App Cards',
  description: 'Launch-critical app cards are published and configured for this locale.',
  tutorialLink: null,
  checks: {
    published: {
      label: 'Published',
      description: 'The document is published for this locale.',
    },
    'title-set': {
      label: 'Title set',
      description: "The card's default-view title is non-empty for this locale.",
    },
    'subtitle-set': {
      label: 'Subtitle set',
      description: "The card's default-view subtitle is non-empty for this locale.",
    },
    'button-label-set': {
      label: 'Button label set',
      description: "The card's default-view button label is non-empty for this locale.",
    },
  },
  prepare: async ({ payload, locale, config, req }) => {
    const launchCriticalIds = config.launchCriticalAppCardIds

    let launchCriticalCards: Record<string, unknown>[] = []
    if (launchCriticalIds.length > 0) {
      const { docs } = await payload.find({
        collection: 'app-cards',
        where: { id: { in: launchCriticalIds } },
        locale,
        // Include drafts so unpublished cards still appear in the readiness
        // report — the per-card `published` check then flags them as failing.
        draft: true,
        limit: 0,
        pagination: false,
        depth: 0,
        req,
      })
      launchCriticalCards = docs as unknown as Record<string, unknown>[]
    }

    const launchCriticalDocs: DocumentReport[] = launchCriticalCards.map((card) => ({
      id: card.id as number,
      label: labelOf(card as { id: number | string; title?: unknown; name?: unknown }),
      checks: appCardChecks(card),
    }))

    // "Other" cards are post-launch extras — only surface ones that are
    // actually live (published) in English. Drafts and cards that only exist
    // in other locales are excluded from this group entirely.
    const otherPublishedWhere: Where = {
      _status: { equals: 'published' },
      ...(launchCriticalIds.length > 0 ? { id: { not_in: launchCriticalIds } } : {}),
    }
    const { docs: enPublishedOther } = await payload.find({
      collection: 'app-cards',
      where: otherPublishedWhere,
      locale: 'en',
      // No `draft` override → published versions only ("published in English").
      limit: 0,
      pagination: false,
      depth: 0,
      req,
    })
    const otherCardIds = enPublishedOther.map((card) => card.id)

    let otherDocs: DocumentReport[] = []
    if (otherCardIds.length > 0) {
      const { docs: otherCardDocs } = await payload.find({
        collection: 'app-cards',
        where: { id: { in: otherCardIds } },
        locale,
        // Per-locale checks still evaluate the latest content for this locale.
        draft: true,
        limit: 0,
        pagination: false,
        depth: 0,
        req,
      })
      otherDocs = (otherCardDocs as unknown as Record<string, unknown>[]).map((card) => ({
        id: card.id as number,
        label: labelOf(card as { id: number | string; title?: unknown; name?: unknown }),
        checks: appCardChecks(card),
      }))
    }

    return { launchCriticalDocs, otherDocs }
  },
  groups: [
    {
      key: 'launch-critical-cards',
      label: 'Launch-critical app cards',
      description: 'Every app card flagged as launch-critical is fully configured for this locale.',
      type: 'documents',
      evaluate: async ({ launchCriticalDocs }) => launchCriticalDocs,
    },
    {
      key: 'other-cards',
      label: 'Other app cards',
      description: 'App cards beyond the launch-critical set (post-launch / nice-to-have).',
      type: 'documents',
      optional: true,
      evaluate: async ({ otherDocs }) => otherDocs,
    },
  ],
}
