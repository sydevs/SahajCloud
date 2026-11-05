'use client'

import type { Action, PlatformId, Step, TrackId } from './steps'
import type { EmbedHeight, InstallValues } from './templates'

import {
  Button,
  Collapsible,
  CopyToClipboard,
  FieldDescription,
  FieldError,
  TextInput,
} from '@payloadcms/ui'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { TitledBanner } from '@/components/admin/helpers/TitledBanner'
import { StatusIcon } from '@/components/admin/ReadinessField/StatusIcon'
import { ToggleGroup } from '@/components/admin/ToggleGroupField/ToggleGroup'
import type { EmbedMetadata } from '@/lib/clients/embedMetadata'
import type { CanonicalVerification } from '@/lib/clients/verification'
import type { Client } from '@/payload-types'

import { CopyBlock } from './CopyBlock'
import styles from './InstallGuide.module.css'
import {
  type BannerContent,
  buildInstallModel,
  buildMilestones,
  type ClaimAnswer,
  checkOutcome,
  reportedMountsFor,
  STAGE_BANNERS,
  type StepStatus,
  type VerifyAnswer,
} from './installModel'
import { InstallProgress } from './InstallProgress'
import {
  hostHints,
  PLATFORM_LABELS,
  PLATFORM_RECOGNISE,
  readAtlasAddress,
  TRACKS_BY_PLATFORM,
  tracksFor,
} from './steps'

/**
 * The Install tab: how one volunteer gets the atlas onto their own site (#1055).
 *
 * **There is no Verify step, on purpose.** Every check this tab can run, it runs
 * by itself: the address is validated as it is typed, and the moment the widget
 * reports itself from the chosen page the tab confirms the embed, claims the
 * region's canonical URLs if nobody else holds them, and runs the SEO checks.
 * A button to remember is a button somebody does not press, and the failure that
 * follows — a site that looks installed and is unindexable — is invisible to the
 * person who caused it. The Check buttons only bring that forward.
 *
 * **Each section waits for the one before it.** Nothing is chosen for the
 * volunteer, so the steps never show for a platform they did not pick, and
 * step 4 waits until the atlas is detected and confirmed: it builds on a working
 * map, and on Wix it starts by renaming the page step 3 made.
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

/** Which Check button asked, so its answer shows beside it. */
type CheckSource = 'sidebar' | 'steps'

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
  /** The service's `allowedDomains`, parsed — a host outside them cannot be claimed. */
  allowedDomains: string[]
}

export function InstallGuide(props: InstallGuideProps): React.ReactElement {
  const { clientId, apiKey, cmsUrl, widgetUrl, editUrl } = props

  const [platform, setPlatform] = useState<PlatformId | null>(null)
  const [track, setTrack] = useState<TrackId | null>(null)
  // `canonical.embed` is a whole `origin + pathname` key, which is exactly the
  // kind of address the field takes.
  const [addressInput, setAddressInput] = useState(props.canonicalEmbed ?? '')
  const [canonicalEmbed, setCanonicalEmbed] = useState(props.canonicalEmbed)
  const [embedMetadata, setEmbedMetadata] = useState(props.initialEmbedMetadata)
  const [verification, setVerification] = useState(props.initialVerification)
  const [embedHeight, setEmbedHeight] = useState<EmbedHeight>('screen')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ from: CheckSource; banner: BannerContent } | null>(null)

  // What has already been confirmed for, so a poll that finds the same report
  // again does not re-run verification every ten seconds.
  const confirmedFor = useRef<string | null>(null)
  // The last answer, verbatim, so an unchanged poll touches no state.
  const lastRead = useRef<string | null>(null)

  const address = useMemo(
    () => readAtlasAddress(addressInput, { wix: platform === 'wix' }),
    [addressInput, platform],
  )
  const atlasPath = address.path

  const values: InstallValues = useMemo(() => {
    // The snippets need *something* while the address has a problem; the
    // sections showing them are hidden until it has none.
    const path = atlasPath ?? '/classes'
    return {
      apiKey: apiKey ?? 'YOUR-API-KEY',
      prefix: path.slice(1),
      atlasUrl: path,
      cmsUrl,
      widgetUrl,
      embedHeight,
    }
  }, [apiKey, atlasPath, cmsUrl, widgetUrl, embedHeight])

  const tracks = useMemo(() => tracksFor(values), [values])
  const activeTrack = track ? tracks[track] : null

  const model = useMemo(
    () =>
      buildInstallModel({
        embedMetadata,
        verification,
        atlasUrl: atlasPath,
        track: activeTrack,
        busy,
      }),
    [embedMetadata, verification, atlasPath, activeTrack, busy],
  )

  const milestones = buildMilestones({
    model,
    verification,
    canonicalEmbed,
    hasRegion: props.hasRegion,
    trackId: track,
  })
  const working = milestones
    .filter((milestone) => milestone.id === 'seen' || milestone.id === 'confirmed')
    .every((milestone) => milestone.state === 'done')

  const { allowedDomains } = props
  const hasTrack = activeTrack !== null
  const hints = useMemo(
    () =>
      platform && hasTrack ? hostHints({ address, platform, trackId: track, allowedDomains }) : [],
    [address, platform, hasTrack, track, allowedDomains],
  )

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
   * third call. Answers what both calls said, for the Check buttons to show.
   */
  const confirm = useCallback(
    async (
      mountKey: string,
    ): Promise<{ claim: ClaimAnswer | null; verify: VerifyAnswer | null }> => {
      setBusy(true)
      try {
        const claim = await post<ClaimAnswer>(`/api/clients/${clientId}/claim-canonical`, {
          mount: mountKey,
        })
        const verify = await post<VerifyAnswer>(`/api/clients/${clientId}/verify-embed`)
        await reread()
        return { claim, verify }
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

  /**
   * Re-run everything after a fix, for a volunteer who has just redone a step.
   *
   * It asks `reportedMountsFor` directly rather than rebuilding the model: that
   * function is also what `buildInstallModel` picks the candidate with, so the
   * button and the poll cannot disagree about which mount to claim.
   */
  const recheck = async (from: CheckSource): Promise<void> => {
    setResult(null)
    const polled = await reread()
    const candidate = reportedMountsFor({
      embedMetadata: (polled?.embedMetadata ?? embedMetadata) as EmbedMetadata | null,
      atlasUrl: atlasPath,
    })[0]
    // Clearing the guard is what makes this button re-run rather than no-op: the
    // poll's effect only acts on a mount it has not confirmed before.
    confirmedFor.current = candidate?.key ?? null
    const answers = candidate ? await confirm(candidate.key) : { claim: null, verify: null }
    setResult({
      from,
      banner: checkOutcome({ path: atlasPath, reported: Boolean(candidate), ...answers }),
    })
  }

  const choosePlatform = (next: PlatformId) => {
    setPlatform(next)
    setResult(null)
    const choices = TRACKS_BY_PLATFORM[next]
    setTrack(choices.length === 1 ? choices[0] : null)
  }

  const tracksHere = platform ? TRACKS_BY_PLATFORM[platform] : []
  const showProblem = addressInput.trim() !== '' && address.problem !== null
  const ready = activeTrack !== null && atlasPath !== null
  const stage = STAGE_BANNERS[model.stage]

  const stepCard = (step: Step, number: number, quiet: boolean) => (
    <StepCard
      embedHeight={embedHeight}
      key={step.id}
      number={number}
      onEmbedHeight={setEmbedHeight}
      quiet={quiet}
      status={model.stepStatus[step.id]}
      step={step}
    />
  )

  return (
    <div className={styles.layout}>
      <div className={styles.main}>
        <div className={styles.banners}>
          <TitledBanner title={stage.title} type={stage.type}>
            {stage.text}
          </TitledBanner>
          {apiKey === null ? (
            <TitledBanner
              action={<a href={editUrl}>Generate one on the Edit tab</a>}
              title="No API key yet"
              type="error"
            >
              Every value below needs one.
            </TitledBanner>
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
              value={platform ?? ''}
            />
          </div>
          <FieldDescription
            description={platform ? PLATFORM_RECOGNISE[platform] : 'Choose how your site is built.'}
            path="platform"
          />

          {tracksHere.length > 1 ? (
            <>
              <div className={styles.choice}>
                <ToggleGroup
                  aria-label="Which version?"
                  onChange={(next) => setTrack(next as TrackId)}
                  options={tracksHere.map((id) => ({ label: tracks[id].label, value: id }))}
                  value={track ?? ''}
                />
              </div>
              <FieldDescription
                description={activeTrack ? activeTrack.recognise : 'Which version is it?'}
                path="track"
              />
            </>
          ) : null}

          {activeTrack?.caveat ? (
            <div className={styles.banners}>
              <TitledBanner
                title={activeTrack.caveat.title}
                type={activeTrack.caveat.tone === 'warning' ? 'warning' : 'default'}
              >
                {activeTrack.caveat.text}
              </TitledBanner>
            </div>
          ) : null}
        </section>

        {activeTrack ? (
          <section className={styles.section}>
            <h3 className={styles.heading}>2. Where should the atlas live?</h3>
            <div className={styles.urlField}>
              <TextInput
                // Payload's error tooltip truncates a sentence, so the whole
                // message goes in the description and the tooltip stays short.
                Description={
                  <FieldDescription
                    className={showProblem ? styles.problem : undefined}
                    description={
                      showProblem && address.problem
                        ? address.problem
                        : atlasPath && address.host
                          ? `The atlas will live at ${atlasPath} on ${address.host}.`
                          : addressHelp(activeTrack.platform)
                    }
                    path="atlasUrl"
                  />
                }
                Error={
                  showProblem ? <FieldError message="Check this address" showError /> : undefined
                }
                label="Atlas address"
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setAddressInput(event.target.value)
                }
                path="atlasUrl"
                placeholder="https://yoursite.org/classes"
                showError={showProblem}
                value={addressInput}
              />
            </div>
            {hints.length > 0 ? (
              <div className={styles.banners}>
                {hints.map((hint) => (
                  <TitledBanner
                    action={
                      hint.action === 'switch-to-iframe' ? (
                        <InlineAction onClick={() => choosePlatform('iframe')}>
                          Switch to Iframe only
                        </InlineAction>
                      ) : hint.action === 'switch-to-wp-com' ? (
                        <InlineAction onClick={() => setTrack('wp-com')}>
                          Switch to WordPress.com
                        </InlineAction>
                      ) : undefined
                    }
                    key={hint.title}
                    title={hint.title}
                    type={hint.tone === 'warning' ? 'warning' : 'default'}
                  >
                    {hint.text}
                  </TitledBanner>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {ready ? (
          <section className={styles.section}>
            <h3 className={styles.heading}>3. Get the atlas on your site</h3>
            {activeTrack.requires ? (
              <TitledBanner
                action={
                  activeTrack.requires.offerIframe ? (
                    <InlineAction onClick={() => choosePlatform('iframe')}>
                      No Business plan? Switch to Iframe only
                    </InlineAction>
                  ) : undefined
                }
                title={activeTrack.requires.title}
              >
                {activeTrack.requires.text}
              </TitledBanner>
            ) : null}
            <ol className={styles.steps}>
              {activeTrack.steps.map((step, index) => stepCard(step, index + 1, false))}
            </ol>
            <div className={styles.checkRow}>
              <Button
                buttonStyle="primary"
                disabled={busy}
                onClick={() => void recheck('steps')}
                size="large"
              >
                {busy ? 'Checking…' : 'Check my site'}
              </Button>
            </div>
            {result?.from === 'steps' ? <ResultBanner banner={result.banner} /> : null}
          </section>
        ) : null}

        {ready && working && activeTrack.more ? (
          <section className={styles.section}>
            <h3 className={styles.heading}>4. {activeTrack.more.title}</h3>
            <p className={styles.intro}>{activeTrack.more.intro}</p>
            <ol className={styles.steps}>
              {activeTrack.more.steps.map((step, index) =>
                stepCard(step, index + 1, Boolean(activeTrack.more?.optional)),
              )}
            </ol>
          </section>
        ) : null}
      </div>

      <aside className={styles.sidebar}>
        <h3 className={styles.heading}>Where this install stands</h3>
        <InstallProgress milestones={milestones} />
        <Button
          buttonStyle="secondary"
          disabled={busy}
          margin={false}
          onClick={() => void recheck('sidebar')}
        >
          {busy ? 'Checking…' : 'Check again'}
        </Button>
        {result?.from === 'sidebar' ? <ResultBanner banner={result.banner} /> : null}
      </aside>
    </div>
  )
}

/** POST to one of this service's endpoints; `null` for anything but a JSON 200. */
async function post<T>(url: string, body?: unknown): Promise<T | null> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      ...(body === undefined
        ? {}
        : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    })
    return response.ok ? ((await response.json()) as T) : null
  } catch {
    return null
  }
}

/** What the address field asks for before anything is typed. */
function addressHelp(platform: PlatformId): string {
  if (platform === 'wix') {
    return 'Paste the address the atlas page will have, such as https://yoursite.org/classes — one word after the domain, lowercase.'
  }
  return 'Paste the address of the page that will show the atlas, such as https://yoursite.org/classes.'
}

function ResultBanner({ banner }: { banner: BannerContent }) {
  return (
    <div className={styles.result} role="status">
      <TitledBanner title={banner.title} type={banner.type}>
        {banner.text}
      </TitledBanner>
    </div>
  )
}

/** What each map height does, in the volunteer's terms. */
const EMBED_HEIGHT_LABELS: Record<EmbedHeight, { label: string; description: string }> = {
  fixed: {
    label: '640 pixels',
    description: 'A fixed box between your header and footer. Fits any page.',
  },
  screen: {
    label: '80% of screen',
    description: 'Grows with the screen, leaving room for your header.',
  },
  window: {
    label: 'Whole window',
    description: 'Covers the browser window, your header included, like an app.',
  },
}

function InlineAction({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <Button buttonStyle="none" className={styles.inlineAction} onClick={onClick}>
      {children}
    </Button>
  )
}

/** One step, its instructions, and what the checks say about it. */
function StepCard({
  number,
  step,
  status,
  quiet,
  embedHeight,
  onEmbedHeight,
}: {
  number: number
  step: Step
  status?: StepStatus
  /** A step nothing checks, in a section where saying so on each one is noise. */
  quiet: boolean
  embedHeight: EmbedHeight
  onEmbedHeight: (next: EmbedHeight) => void
}): React.ReactElement {
  const failed = status?.state === 'fail'
  const finished = status?.state === 'pass' || status?.state === 'done'
  return (
    <li data-step={step.id}>
      <Collapsible
        // `initCollapsed` is read once, at mount. Keyed on the result, a step
        // folds away when a check confirms it and opens again when one fails.
        key={status?.state ?? 'none'}
        actions={quiet ? null : <StepState status={status} unobservable={step.unobservable} />}
        collapsibleStyle={failed ? 'error' : 'default'}
        header={
          <span className={styles.stepTitle}>
            {number}. {step.title}
          </span>
        }
        initCollapsed={finished}
      >
        <ol className={styles.actions}>
          {step.actions.map((action) => (
            <ActionItem
              action={action}
              embedHeight={embedHeight}
              key={typeof action === 'string' ? action : action.text}
              onEmbedHeight={onEmbedHeight}
            />
          ))}
        </ol>

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

/**
 * One instruction, with what it needs right under it: a value to copy, or a file
 * to download. A short value sits on one line with its Copy button; code keeps
 * the read-only editor.
 */
function ActionItem({
  action,
  embedHeight,
  onEmbedHeight,
}: {
  action: Action
  embedHeight: EmbedHeight
  onEmbedHeight: (next: EmbedHeight) => void
}) {
  if (typeof action === 'string') return <li>{action}</li>
  const { text, snippet, download, choice } = action
  return (
    <li>
      {text}
      {choice === 'embed-height' ? (
        <div className={styles.inlineChoice}>
          <ToggleGroup
            aria-label="Map height"
            onChange={(next) => onEmbedHeight(next as EmbedHeight)}
            options={(Object.keys(EMBED_HEIGHT_LABELS) as EmbedHeight[]).map((id) => ({
              label: EMBED_HEIGHT_LABELS[id].label,
              value: id,
            }))}
            value={embedHeight}
          />
          <FieldDescription
            description={EMBED_HEIGHT_LABELS[embedHeight].description}
            path="embedHeight"
          />
        </div>
      ) : null}
      {download ? (
        <div className={styles.inlineValue}>
          <Button buttonStyle="primary" el="anchor" margin={false} size="small" url={download.url}>
            {download.label}
          </Button>
        </div>
      ) : null}
      {snippet?.kind === 'text' ? (
        <div className={styles.inlineValue}>
          <code aria-label={snippet.label} className={styles.inlineCode}>
            {snippet.value}
          </code>
          <CopyToClipboard value={snippet.value} />
        </div>
      ) : snippet ? (
        <CopyBlock snippet={snippet} />
      ) : null}
    </li>
  )
}

/** The step's check result, quiet unless there is one. */
function StepState({ status, unobservable }: { status?: StepStatus; unobservable?: boolean }) {
  if (status?.state === 'done') {
    return (
      <span className={styles.statePass} title="A later step is confirmed, so this one was done.">
        <StatusIcon passed title="Done" />
        Done
      </span>
    )
  }
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
