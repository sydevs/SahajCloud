'use client'

import type { PlatformId, Step, TrackId } from './steps'
import type { InstallValues } from './templates'

import { Banner, Button, Pill } from '@payloadcms/ui'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { EmbedMetadata } from '@/lib/clients/embedMetadata'
import type { CanonicalVerification } from '@/lib/clients/verification'
import type { Client } from '@/payload-types'

import { CopyBlock } from './CopyBlock'
import styles from './InstallGuide.module.css'
import { buildInstallModel, STAGE_MESSAGES, type StepStatus } from './installModel'
import {
  atlasUrlProblem,
  hostHints,
  PLATFORM_LABELS,
  PLATFORM_RECOGNISE,
  TRACKS_BY_PLATFORM,
  tracksFor,
} from './steps'
import { prefixFromMount } from './templates'

/**
 * The Install tab: how one volunteer gets the atlas onto their own site (#1055).
 *
 * **There is no Verify step, on purpose.** Every check this tab can run, it runs
 * by itself: the address is validated as it is typed, and the moment the widget
 * reports itself from the chosen page the tab confirms the embed, claims the
 * region's canonical URLs if nobody else holds them, and runs the SEO checks.
 * A button to remember is a button somebody does not press, and the failure that
 * follows — a site that looks installed and is unindexable — is invisible to the
 * person who caused it.
 *
 * **Everything it knows comes off the service's own record**, re-read on a
 * timer. There is no state here that outlives the tab: the platform choice and
 * the address are this visit's, because nothing about them is worth a column and
 * a migration, and the install either worked or the record says what is wrong
 * with it.
 */

/** How often the tab re-reads the record while it is open. */
const POLL_MS = 10_000

/** What `GET /api/clients/:id` gives the tab, narrowed to what it reads. */
type PolledClient = Pick<Client, 'embedMetadata' | 'canonical' | 'region'>

export interface InstallGuideProps {
  clientId: number
  clientName: string
  /** The service's API key, revealed server-side for this one render. */
  apiKey: string | null
  cmsUrl: string
  widgetUrl: string
  /** The designated mount, when there already is one — it prefills the address. */
  canonicalEmbed: string | null
  initialEmbedMetadata: EmbedMetadata | null
  initialVerification: CanonicalVerification | null
  /** Whether a region is set, which canonical ownership needs. */
  hasRegion: boolean
}

export function InstallGuide(props: InstallGuideProps): React.ReactElement {
  const { clientId, apiKey, cmsUrl, widgetUrl } = props

  const [platform, setPlatform] = useState<PlatformId>('wordpress')
  const [track, setTrack] = useState<TrackId>('wp-selfhosted')
  const [atlasUrl, setAtlasUrl] = useState(() =>
    props.canonicalEmbed ? `/${prefixFromMount(props.canonicalEmbed)}` : '/classes',
  )
  const [embedMetadata, setEmbedMetadata] = useState(props.initialEmbedMetadata)
  const [verification, setVerification] = useState(props.initialVerification)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  // What has already been confirmed for, so a poll that finds the same report
  // again does not re-run verification every ten seconds.
  const confirmedFor = useRef<string | null>(null)

  const problem = atlasUrlProblem(atlasUrl)
  const prefix = problem ? '' : atlasUrl.replace(/^\//, '')

  const values: InstallValues = useMemo(
    () => ({
      apiKey: apiKey ?? 'YOUR-API-KEY',
      prefix: prefix || 'classes',
      atlasUrl: problem ? '/classes' : atlasUrl,
      cmsUrl,
      widgetUrl,
    }),
    [apiKey, prefix, problem, atlasUrl, cmsUrl, widgetUrl],
  )

  const tracks = useMemo(() => tracksFor(values), [values])
  const activeTrack = tracks[track]

  const model = useMemo(
    () => buildInstallModel({ embedMetadata, verification, atlasUrl, track: activeTrack, busy }),
    [embedMetadata, verification, atlasUrl, activeTrack, busy],
  )

  const siteHost = model.reported[0]?.host ?? null
  const hints = useMemo(() => hostHints({ host: siteHost, platform }), [siteHost, platform])

  /** Re-read the record. The one thing that makes this tab live. */
  const reread = useCallback(async (): Promise<PolledClient | null> => {
    try {
      const response = await fetch(`/api/clients/${clientId}?depth=0`, {
        credentials: 'include',
      })
      if (!response.ok) return null
      const body = (await response.json()) as PolledClient
      setEmbedMetadata((body.embedMetadata ?? null) as EmbedMetadata | null)
      setVerification((body.canonical?.verification ?? null) as CanonicalVerification | null)
      return body
    } catch {
      return null
    }
  }, [clientId])

  /**
   * Confirm the embed, claim the canonical, run the SEO checks — in that order.
   *
   * The order is the dependency: the checks compare what a crawler sees against
   * the canonical this service publishes, so claiming it afterwards would check
   * the previous owner's answer. `verify-embed` runs the checks itself once the
   * mount verifies, which is why this ends with one more read rather than a
   * third call.
   */
  const confirm = useCallback(
    async (mountKey: string) => {
      setBusy(true)
      setNotice(null)
      try {
        const claim = await fetch(`/api/clients/${clientId}/claim-canonical`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ mount: mountKey }),
        })
        const claimed = (await claim.json().catch(() => null)) as { message?: string } | null
        if (claimed?.message) setNotice(claimed.message)

        await fetch(`/api/clients/${clientId}/verify-embed`, {
          method: 'POST',
          credentials: 'include',
        })
        await reread()
      } catch {
        setNotice('Could not reach the CMS to confirm your site. Nothing was changed.')
      } finally {
        setBusy(false)
      }
    },
    [clientId, reread],
  )

  // The poll. Re-reading the record is what turns a report arriving on the
  // volunteer's own site into a confirmed install with nothing clicked.
  useEffect(() => {
    const timer = setInterval(() => void reread(), POLL_MS)
    return () => clearInterval(timer)
  }, [reread])

  // And this is what acts on it. Keyed on the mount, so a second report from the
  // same page does nothing and a report from a different page confirms afresh.
  useEffect(() => {
    const candidate = model.candidate
    if (!candidate || busy) return
    if (confirmedFor.current === candidate.key) return
    confirmedFor.current = candidate.key
    void confirm(candidate.key)
  }, [model.candidate, busy, confirm])

  const choosePlatform = (next: PlatformId) => {
    setPlatform(next)
    setTrack(TRACKS_BY_PLATFORM[next][0])
  }

  return (
    <div className={styles.guide}>
      <Banner type={bannerType(model.stage)}>{STAGE_MESSAGES[model.stage]}</Banner>

      {notice ? <Banner type="default">{notice}</Banner> : null}

      {apiKey === null ? (
        <Banner type="error">
          This service has no API key yet. Generate one on the Access tab first — every value below
          needs it.
        </Banner>
      ) : null}

      <section>
        <h3>1. What kind of site is it?</h3>
        <div className={styles.platforms}>
          {(Object.keys(PLATFORM_LABELS) as PlatformId[]).map((id) => (
            <Pill
              key={id}
              onClick={() => choosePlatform(id)}
              pillStyle={platform === id ? 'always-white' : 'light'}
            >
              {PLATFORM_LABELS[id]}
            </Pill>
          ))}
        </div>
        <p className={styles.recognise}>{PLATFORM_RECOGNISE[platform]}</p>

        {TRACKS_BY_PLATFORM[platform].length > 1 ? (
          <div className={styles.tracks}>
            {TRACKS_BY_PLATFORM[platform].map((id) => (
              <Pill
                key={id}
                onClick={() => setTrack(id)}
                pillStyle={track === id ? 'always-white' : 'light'}
              >
                {tracks[id].label}
              </Pill>
            ))}
          </div>
        ) : null}
        <p className={styles.recognise}>{activeTrack.recognise}</p>

        {hints.map((hint) => (
          <Banner key={hint.message} type="error">
            {hint.message}
            {hint.offerIframe ? (
              <>
                {' '}
                <Button buttonStyle="none" onClick={() => choosePlatform('iframe')}>
                  Switch to the iframe track
                </Button>
              </>
            ) : null}
          </Banner>
        ))}

        {activeTrack.caveat ? <Banner type="default">{activeTrack.caveat}</Banner> : null}
      </section>

      <section>
        <h3>2. Where should the atlas live?</h3>
        <div className={styles.urlField}>
          <input
            aria-label="Atlas address"
            className="field-type text"
            onChange={(event) => setAtlasUrl(event.target.value)}
            value={atlasUrl}
          />
          {problem ? <span className={styles.problem}>{problem}</span> : null}
        </div>
      </section>

      <section>
        <h3>3. Do these, in order</h3>
        <ol className={styles.steps}>
          {activeTrack.steps.map((step) => (
            <StepCard key={step.id} status={model.stepStatus[step.id]} step={step} />
          ))}
        </ol>
      </section>

      <section>
        <h3>Where this install stands</h3>
        <dl className={styles.statusPanel}>
          <Row label="The atlas has been seen at">
            {model.reported.length === 0
              ? 'nowhere yet'
              : model.reported.map((mount) => `${mount.host}${mount.mount}`).join(', ')}
          </Row>
          <Row label="Confirmed by the CMS">
            {verification?.verified
              ? `yes, on ${verification.verified.domain}${verification.verified.mount}`
              : 'not yet'}
          </Row>
          <Row label="Web address shape">
            {verification?.routingProbe?.verdict === 'path'
              ? 'one address per class page'
              : 'one address with ?atlas= on the end'}
          </Row>
          <Row label="Owns its region’s addresses">
            {props.canonicalEmbed ? 'yes' : props.hasRegion ? 'not yet' : 'no region set'}
          </Row>
          <Row label="What search engines can read">
            {verification?.seo
              ? model.failures.length === 0
                ? 'everything we publish'
                : `${model.failures.length} problem${model.failures.length === 1 ? '' : 's'} — see the marked steps`
              : 'not checked yet'}
          </Row>
        </dl>
        <Button disabled={busy} onClick={() => void recheck()}>
          {busy ? 'Checking…' : 'Check again'}
        </Button>
      </section>
    </div>
  )

  /** Re-run everything after a fix, for a volunteer who has just redone a step. */
  async function recheck(): Promise<void> {
    const polled = await reread()
    const candidate = buildInstallModel({
      embedMetadata: (polled?.embedMetadata ?? embedMetadata) as EmbedMetadata | null,
      verification,
      atlasUrl,
      track: activeTrack,
    }).candidate
    // Clearing the guard is what makes this button re-run rather than no-op: the
    // poll's effect only acts on a mount it has not confirmed before.
    confirmedFor.current = null
    if (candidate) await confirm(candidate.key)
    else setNotice('The atlas has not reported itself from this page yet.')
  }
}

function bannerType(
  stage: ReturnType<typeof buildInstallModel>['stage'],
): 'default' | 'error' | 'success' {
  if (stage === 'verified') return 'success'
  if (stage === 'warnings' || stage === 'failed') return 'error'
  return 'default'
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.statusRow}>
      <dt className={styles.statusKey}>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

/** One step, its instructions, its snippets, and what the checks say about it. */
function StepCard({ step, status }: { step: Step; status?: StepStatus }): React.ReactElement {
  return (
    <li className={styles.step} data-step={step.id}>
      <div className={styles.stepHeader}>
        <p className={styles.stepTitle}>{step.title}</p>
        {status && status.state !== 'unknown' ? (
          <Pill pillStyle={status.state === 'pass' ? 'success' : 'error'}>
            {status.state === 'pass' ? 'Confirmed' : 'Redo this step'}
          </Pill>
        ) : step.unobservable ? (
          <Pill pillStyle="light">Nothing to check</Pill>
        ) : null}
      </div>

      <ol className={styles.actions}>
        {step.actions.map((action) => (
          <li key={action}>{action}</li>
        ))}
      </ol>

      {(step.snippets ?? []).map((snippet) => (
        <CopyBlock key={snippet.label} snippet={snippet} />
      ))}

      {status && status.messages.length > 0 && status.state === 'fail' ? (
        <ul className={styles.stepMessages}>
          {status.messages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : null}
    </li>
  )
}

export default InstallGuide
