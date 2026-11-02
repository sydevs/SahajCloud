'use client'

import type { PlatformId, Step, TrackId } from './steps'
import type { InstallValues } from './templates'

import {
  Banner,
  Button,
  Collapsible,
  FieldDescription,
  FieldError,
  TextInput,
} from '@payloadcms/ui'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { StatusIcon } from '@/components/admin/ReadinessField/StatusIcon'
import { ToggleGroup } from '@/components/admin/ToggleGroupField/ToggleGroup'
import type { EmbedMetadata } from '@/lib/clients/embedMetadata'
import { type CanonicalVerification, splitMountKey } from '@/lib/clients/verification'
import type { Client } from '@/payload-types'

import { CopyBlock } from './CopyBlock'
import styles from './InstallGuide.module.css'
import {
  buildInstallModel,
  reportedMountsFor,
  STAGE_MESSAGES,
  type StepStatus,
} from './installModel'
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
  /** The service's API key, revealed server-side for this one render. */
  apiKey: string | null
  cmsUrl: string
  widgetUrl: string
  /** The designated mount key (origin + path), when there is one — it prefills the address. */
  canonicalEmbed: string | null
  /** This service's Edit view, where its API key is generated. */
  editUrl: string
  initialEmbedMetadata: EmbedMetadata | null
  initialVerification: CanonicalVerification | null
  /** Whether a region is set, which canonical ownership needs. */
  hasRegion: boolean
}

export function InstallGuide(props: InstallGuideProps): React.ReactElement {
  const { clientId, apiKey, cmsUrl, widgetUrl, editUrl } = props

  const [platform, setPlatform] = useState<PlatformId>('wordpress')
  const [track, setTrack] = useState<TrackId>('wp-selfhosted')
  const [atlasUrl, setAtlasUrl] = useState(() => {
    // `canonical.embed` is a whole `origin + pathname` key, not a path.
    const mount = props.canonicalEmbed ? splitMountKey(props.canonicalEmbed)?.mount : null
    return mount ? `/${prefixFromMount(mount)}` : '/classes'
  })
  const [canonicalEmbed, setCanonicalEmbed] = useState(props.canonicalEmbed)
  const [embedMetadata, setEmbedMetadata] = useState(props.initialEmbedMetadata)
  const [verification, setVerification] = useState(props.initialVerification)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  // What has already been confirmed for, so a poll that finds the same report
  // again does not re-run verification every ten seconds.
  const confirmedFor = useRef<string | null>(null)
  // The last answer, verbatim, so an unchanged poll touches no state.
  const lastRead = useRef<string | null>(null)

  const problem = atlasUrlProblem(atlasUrl)
  // One fallback, spelled once: the snippets have to show *something* while the
  // address is being typed, and three places agreeing about what is three
  // places to keep agreeing.
  const safeUrl = problem ? '/classes' : atlasUrl

  const values: InstallValues = useMemo(
    () => ({
      apiKey: apiKey ?? 'YOUR-API-KEY',
      prefix: safeUrl.slice(1),
      atlasUrl: safeUrl,
      cmsUrl,
      widgetUrl,
    }),
    [apiKey, safeUrl, cmsUrl, widgetUrl],
  )

  const tracks = useMemo(() => tracksFor(values), [values])
  const activeTrack = tracks[track]

  const model = useMemo(
    () => buildInstallModel({ embedMetadata, verification, atlasUrl, track: activeTrack, busy }),
    [embedMetadata, verification, atlasUrl, activeTrack, busy],
  )

  // The candidate *is* `reported[0]`, so there is one name for it.
  const siteHost = model.candidate?.host ?? null
  const hints = useMemo(() => hostHints({ host: siteHost, platform }), [siteHost, platform])

  /**
   * Re-read the record. The one thing that makes this tab live.
   *
   * Two bounds, both because this runs every {@link POLL_MS} for as long as the
   * tab is open — and the tab is the one page a volunteer is told to leave open
   * while they work: it asks for the three fields the tab reads rather than the
   * whole document, and it leaves state untouched when the answer is byte-for-byte
   * the previous one, so an unchanged poll costs no re-render.
   */
  const reread = useCallback(async (): Promise<PolledClient | null> => {
    try {
      const response = await fetch(
        `/api/clients/${clientId}?depth=0&select[embedMetadata]=true&select[canonical]=true&select[region]=true`,
        { credentials: 'include' },
      )
      if (!response.ok) return null
      const text = await response.text()
      const body = JSON.parse(text) as PolledClient
      if (text !== lastRead.current) {
        lastRead.current = text
        setEmbedMetadata((body.embedMetadata ?? null) as EmbedMetadata | null)
        setVerification((body.canonical?.verification ?? null) as CanonicalVerification | null)
        setCanonicalEmbed(body.canonical?.embed ?? null)
      }
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
  //
  // ⚠ **It stops once the install is finished and clean.** Nothing the tab
  // reads can change from there without a person, and a volunteer leaves this
  // page open — so polling on would be 360 document reads an hour saying the
  // same thing. "Check again" is the way back.
  const settled = model.stage === 'verified'
  useEffect(() => {
    if (settled) return
    const timer = setInterval(() => void reread(), POLL_MS)
    return () => clearInterval(timer)
  }, [reread, settled])

  // And this is what acts on it. Keyed on the mount, so a second report from the
  // same page does nothing and a report from a different page confirms afresh.
  useEffect(() => {
    const candidate = model.candidate
    if (!candidate || busy) return
    if (confirmedFor.current === candidate.key) return
    confirmedFor.current = candidate.key
    // Already claimed and confirmed at this mount: opening the tab again must
    // not re-run a browser verification. "Check again" still forces one.
    const verified = verification?.verified
    if (
      canonicalEmbed === candidate.key &&
      verified?.domain === candidate.host &&
      verified.mount === candidate.mount
    ) {
      return
    }
    void confirm(candidate.key)
  }, [model.candidate, busy, confirm, canonicalEmbed, verification])

  const choosePlatform = (next: PlatformId) => {
    setPlatform(next)
    setTrack(TRACKS_BY_PLATFORM[next][0])
  }

  const tracksHere = TRACKS_BY_PLATFORM[platform]

  return (
    <div className={styles.layout}>
      <div className={styles.main}>
        <div className={styles.banners}>
          <Banner type={bannerType(model.stage)}>{STAGE_MESSAGES[model.stage]}</Banner>
          {apiKey === null ? (
            <Banner type="error">
              This service has no API key yet. <a href={editUrl}>Generate one on the Edit tab</a>{' '}
              first — every value below needs it.
            </Banner>
          ) : null}
        </div>

        <section className={styles.section}>
          <h3 className={styles.heading}>1. What kind of site is it?</h3>
          <div className={styles.choice}>
            <ToggleGroup
              aria-label="What kind of site is it?"
              onChange={(next) => choosePlatform(next as PlatformId)}
              options={(Object.keys(PLATFORM_LABELS) as PlatformId[]).map((id) => ({
                label: PLATFORM_LABELS[id],
                value: id,
              }))}
              value={platform}
            />
          </div>
          <FieldDescription description={PLATFORM_RECOGNISE[platform]} path="platform" />

          {tracksHere.length > 1 ? (
            <div className={styles.choice}>
              <ToggleGroup
                aria-label="Which version?"
                onChange={(next) => setTrack(next as TrackId)}
                options={tracksHere.map((id) => ({ label: tracks[id].label, value: id }))}
                value={track}
              />
            </div>
          ) : null}
          <FieldDescription description={activeTrack.recognise} path="track" />

          {hints.length > 0 || activeTrack.caveat ? (
            <div className={styles.banners}>
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
              {activeTrack.caveat ? <Banner type="info">{activeTrack.caveat}</Banner> : null}
            </div>
          ) : null}
        </section>

        <section className={styles.section}>
          <h3 className={styles.heading}>2. Where should the atlas live?</h3>
          <div className={styles.urlField}>
            <TextInput
              // Payload's error tooltip truncates a sentence, so the whole
              // message goes in the description and the tooltip stays short.
              Description={
                <FieldDescription
                  className={problem ? styles.problem : undefined}
                  description={
                    problem ?? 'The page on your site that will show the atlas, such as /classes.'
                  }
                  path="atlasUrl"
                />
              }
              Error={problem ? <FieldError message="Check this address" showError /> : undefined}
              label="Atlas address"
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setAtlasUrl(event.target.value)
              }
              path="atlasUrl"
              showError={Boolean(problem)}
              value={atlasUrl}
            />
          </div>
        </section>

        <section className={styles.section}>
          <h3 className={styles.heading}>3. Do these, in order</h3>
          <ol className={styles.steps}>
            {activeTrack.steps.map((step, index) => (
              <StepCard
                key={step.id}
                number={index + 1}
                status={model.stepStatus[step.id]}
                step={step}
              />
            ))}
          </ol>
        </section>
      </div>

      <aside className={styles.sidebar}>
        <h3 className={styles.heading}>Where this install stands</h3>
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
            {canonicalEmbed ? 'yes' : props.hasRegion ? 'not yet' : 'no region set'}
          </Row>
          <Row label="What search engines can read">
            {verification?.seo
              ? model.failures.length === 0
                ? 'everything we publish'
                : `${model.failures.length} problem${model.failures.length === 1 ? '' : 's'} — see the marked steps`
              : 'not checked yet'}
          </Row>
        </dl>
        {notice ? <p className={styles.notice}>{notice}</p> : null}
        <Button buttonStyle="secondary" disabled={busy} onClick={() => void recheck()}>
          {busy ? 'Checking…' : 'Check again'}
        </Button>
      </aside>
    </div>
  )

  /**
   * Re-run everything after a fix, for a volunteer who has just redone a step.
   *
   * It asks `reportedMountsFor` directly rather than rebuilding the model: that
   * function is also what `buildInstallModel` picks the candidate with, so the
   * button and the poll cannot disagree about which mount to claim.
   */
  async function recheck(): Promise<void> {
    const polled = await reread()
    const candidate = reportedMountsFor({
      embedMetadata: (polled?.embedMetadata ?? embedMetadata) as EmbedMetadata | null,
      atlasUrl,
    })[0]
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
function StepCard({
  number,
  step,
  status,
}: {
  number: number
  step: Step
  status?: StepStatus
}): React.ReactElement {
  const failed = status?.state === 'fail'
  return (
    <li data-step={step.id}>
      <Collapsible
        actions={<StepState status={status} unobservable={step.unobservable} />}
        collapsibleStyle={failed ? 'error' : 'default'}
        header={
          <span className={styles.stepTitle}>
            {number}. {step.title}
          </span>
        }
        initCollapsed={status?.state === 'pass'}
      >
        <ol className={styles.actions}>
          {step.actions.map((action) => (
            <li key={action}>{action}</li>
          ))}
        </ol>

        {(step.snippets ?? []).map((snippet) => (
          <CopyBlock key={snippet.label} snippet={snippet} />
        ))}

        {failed && status.messages.length > 0 ? (
          <ul className={styles.stepMessages}>
            {status.messages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        ) : null}
      </Collapsible>
    </li>
  )
}

/** The step's check result, quiet unless there is one. */
function StepState({ status, unobservable }: { status?: StepStatus; unobservable?: boolean }) {
  if (status && status.state !== 'unknown') {
    const passed = status.state === 'pass'
    return (
      <span className={passed ? styles.statePass : styles.stateFail}>
        <StatusIcon passed={passed} />
        {passed ? 'Confirmed' : 'Redo this step'}
      </span>
    )
  }
  return unobservable ? <span className={styles.stateQuiet}>Not checked automatically</span> : null
}

export default InstallGuide
