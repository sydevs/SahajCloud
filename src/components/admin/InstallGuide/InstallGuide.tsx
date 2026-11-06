'use client'

import type { Action, PlatformId, Step, TrackId } from './steps'
import type { EmbedHeight, InstallValues } from './templates'

import {
  Button,
  Collapsible,
  CopyToClipboard,
  FieldDescription,
  FieldError,
  SelectInput,
  Table,
  TextInput,
} from '@payloadcms/ui'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { tableColumn } from '@/components/admin/helpers/tableColumn'
import { InfoBanner } from '@/components/admin/InfoBanner'
import { StatusIcon } from '@/components/admin/ReadinessField/StatusIcon'
import { ToggleGroup } from '@/components/admin/ToggleGroupField/ToggleGroup'
import {
  ATLAS_DEFAULT_COLORS,
  DEFAULT_SERVICE_LOGO,
  effectiveColor,
  isBrandColor,
} from '@/lib/clients/appearance'
import type { EmbedMetadata } from '@/lib/clients/embedMetadata'
import { primaryPageUrl } from '@/lib/clients/site'
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
  sectionConfirmed,
  stageBanner,
  type StepStatus,
  type VerifyAnswer,
} from './installModel'
import { InstallProgress } from './InstallProgress'
import {
  hostHints,
  PLATFORM_LABELS,
  platformOf,
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
 * timer, and every choice made here is saved back to it as it is made
 * (`useSiteSave`): the kind of site, the address, the map's height and the
 * site's language. Reopening the tab picks up where it was left. The edit form
 * never carries those fields (`admin.disabled` on `Clients.site`), so saving
 * the form cannot write back an older copy.
 */

/** How often the tab re-reads the record while it is open. */
const POLL_MS = 10_000

/** What `GET /api/clients/:id` gives the tab, narrowed to what it reads. */
type PolledClient = Pick<Client, 'embedMetadata' | 'canonical'>

/** Which Check button asked, so its answer shows beside it. */
type CheckSource = 'sidebar' | 'section3' | 'section4'

export interface InstallGuideProps {
  clientId: number
  /** The service's API key, revealed server-side for this one render. */
  apiKey: string | null
  cmsUrl: string
  widgetUrl: string
  /** This service's Edit view, where its API key is generated and its branding set. */
  editUrl: string
  /** What the tab saved last time: the kind of site, the address, the map's height. */
  initialSite: Client['site'] | null
  initialLanguage: string | null
  languageOptions: Array<{ label: string; value: string }>
  initialEmbedMetadata: EmbedMetadata | null
  initialVerification: CanonicalVerification | null
  /** Whether this service's site is the home for its region's links. */
  initialOwned: boolean
  /** The region's name, or `null` for a worldwide map. Set by an admin, read-only here. */
  regionName: string | null
  /** What "Make it yours" previews, as stored — `null` where nothing is set. */
  appearance: Appearance
}

/** A service's look, as the Atlas tab holds it. */
export interface Appearance {
  logoUrl: string | null
  colors: Record<keyof typeof ATLAS_DEFAULT_COLORS, string | null>
  /**
   * Where a seeker's reply lands: the support email, else the sender address
   * (`USER_EMAIL_FROM`, server-only), since a registration email without one
   * carries no Reply-To.
   */
  replyTo: string
  /** The mailing-list provider's name while the list is on, else `null`. */
  mailingList: string | null
}

const COLOR_LABELS: Record<keyof typeof ATLAS_DEFAULT_COLORS, string> = {
  color1: 'Primary',
  color2: 'Secondary',
  color3: 'Tertiary',
}

/**
 * Four small tiles — the logo and the three brand colours — each showing the
 * default when the service has none of its own, and a two-row table of where
 * replies and subscribers go, the other two things the Atlas tab sets.
 */
function AppearancePreview({ appearance }: { appearance: Appearance }) {
  return (
    <>
      <div className={styles.appearance}>
        <figure className={styles.tile}>
          {}
          <img
            alt=""
            className={styles.tileLogo}
            src={appearance.logoUrl ?? DEFAULT_SERVICE_LOGO}
          />
          <figcaption>
            Logo
            <span className={styles.tileNote}>{appearance.logoUrl ? 'Yours' : 'Default'}</span>
          </figcaption>
        </figure>
        {(Object.keys(COLOR_LABELS) as Array<keyof typeof ATLAS_DEFAULT_COLORS>).map((column) => {
          const value = appearance.colors[column]
          const color = effectiveColor(column, value)
          return (
            <figure className={styles.tile} key={column}>
              <span className={styles.tileColor} style={{ background: color }} />
              <figcaption>
                {COLOR_LABELS[column]}
                <span className={styles.tileNote}>
                  {color.toUpperCase()} {isBrandColor(value) ? '' : '· Default'}
                </span>
              </figcaption>
            </figure>
          )
        })}
      </div>
      <div className={styles.appearanceTable}>
        <Table
          appearance="condensed"
          columns={[
            tableColumn('setting', 'Setting', ['Contact Email', 'Mailing List']),
            tableColumn('value', 'Current', [
              `${appearance.replyTo} — Seekers’ replies to emails are sent here`,
              appearance.mailingList ??
                'None configured — configure it to automatically subscribe new seekers to your mailing list',
            ]),
          ]}
          data={[{ id: 'replies' }, { id: 'list' }]}
        />
      </div>
    </>
  )
}

export function InstallGuide(props: InstallGuideProps): React.ReactElement {
  const { clientId, apiKey, cmsUrl, widgetUrl, editUrl } = props

  const saved = props.initialSite
  const [track, setTrackState] = useState<TrackId | null>(saved?.track ?? null)
  const [platform, setPlatform] = useState<PlatformId | null>(
    saved?.track ? platformOf(saved.track) : null,
  )
  const [addressInput, setAddressInput] = useState(() => primaryPageUrl(saved) ?? '')
  const [embedHeight, setEmbedHeightState] = useState<EmbedHeight>(saved?.embedHeight ?? 'screen')
  const [language, setLanguageState] = useState(props.initialLanguage)
  const [owned, setOwned] = useState(props.initialOwned)
  const [embedMetadata, setEmbedMetadata] = useState(props.initialEmbedMetadata)
  const [verification, setVerification] = useState(props.initialVerification)
  const { state: saveState, save } = useSiteSave(clientId)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ from: CheckSource; banner: BannerContent } | null>(null)

  // What has already been confirmed for, so a poll that finds the same report
  // again does not re-run verification every ten seconds.
  const confirmedFor = useRef<string | null>(null)
  // The last answer, verbatim, so an unchanged poll touches no state.
  const lastRead = useRef<string | null>(null)

  const address = useMemo(
    () =>
      readAtlasAddress(addressInput, {
        oneLevel:
          platform === 'wix' || platform === 'squarespace' ? PLATFORM_LABELS[platform] : undefined,
      }),
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
        host: address.host,
      }),
    [embedMetadata, verification, atlasPath, activeTrack, busy, address.host],
  )

  const milestones = buildMilestones({
    model,
    verification,
    owned,
    searchListings: activeTrack?.searchListings !== false,
    classAddresses: activeTrack?.classAddresses !== false,
    siteKind: platform ? PLATFORM_LABELS[platform] : undefined,
    regionName: props.regionName,
    host: address.host,
  })
  const working = milestones
    .filter((milestone) => milestone.id === 'seen' || milestone.id === 'confirmed')
    .every((milestone) => milestone.state === 'done')

  const savedDomain = saved?.domain ?? null
  const hasTrack = activeTrack !== null
  const hints = useMemo(
    () =>
      platform && hasTrack ? hostHints({ address, platform, trackId: track, savedDomain }) : [],
    [address, platform, hasTrack, track, savedDomain],
  )

  // Each choice is saved as it is made. The address waits for a pause in typing
  // and for an address with no problem, so a half-typed one is never stored.
  const siteNow = useCallback(
    (patch: Partial<NonNullable<Client['site']>>) => ({
      domain: address.problem === null ? address.host : (saved?.domain ?? null),
      page: address.problem === null ? address.path : (saved?.page ?? null),
      track,
      embedHeight,
      ...patch,
    }),
    [address, saved, track, embedHeight],
  )
  const setTrack = (next: TrackId | null) => {
    setTrackState(next)
    if (next) save({ site: siteNow({ track: next }) })
  }
  const setEmbedHeight = (next: EmbedHeight) => {
    setEmbedHeightState(next)
    save({ site: siteNow({ embedHeight: next }) })
  }
  const setLanguage = (next: string | null) => {
    setLanguageState(next)
    save({ language: next })
  }
  const storedAddress = useRef(primaryPageUrl(saved))
  useEffect(() => {
    if (address.problem !== null || !address.host || !address.path) return
    const next = primaryPageUrl({ domain: address.host, page: address.path })
    if (next === storedAddress.current) return
    const timer = setTimeout(() => {
      storedAddress.current = next
      save({ site: siteNow({}) })
    }, ADDRESS_SAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [address, save, siteNow])

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
        `/api/clients/${clientId}?depth=0&select[embedMetadata]=true&select[canonical]=true`,
        { credentials: 'include' },
      )
      if (!response.ok) return null
      const text = await response.text()
      const body = JSON.parse(text) as PolledClient
      if (text !== lastRead.current) {
        lastRead.current = text
        setEmbedMetadata((body.embedMetadata ?? null) as EmbedMetadata | null)
        setVerification((body.canonical?.verification ?? null) as CanonicalVerification | null)
        setOwned(Boolean(body.canonical?.owned))
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
  const confirm = useCallback(async (): Promise<{
    claim: ClaimAnswer | null
    verify: VerifyAnswer | null
  }> => {
    setBusy(true)
    try {
      // The primary page is the record's own, so the claim takes no body —
      // and the address must be saved before it can name the right page.
      await save.flush()
      const claim = await post<ClaimAnswer>(`/api/clients/${clientId}/claim-canonical`)
      const verify = await post<VerifyAnswer>(`/api/clients/${clientId}/verify-embed`)
      await reread()
      return { claim, verify }
    } finally {
      setBusy(false)
    }
  }, [clientId, reread, save])

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
    // Already confirmed at this page: opening the tab again must not re-run a
    // browser verification. "Check again" still forces one.
    const verified = verification?.verified
    if (verified?.domain === candidate.host && verified.mount === candidate.mount) return
    void confirm()
  }, [model.candidate, busy, confirm, verification])

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
      host: address.host,
    })[0]
    // Clearing the guard is what makes this button re-run rather than no-op: the
    // poll's effect only acts on a mount it has not confirmed before.
    confirmedFor.current = candidate?.key ?? null
    const answers = candidate ? await confirm() : { claim: null, verify: null }
    setResult({
      from,
      banner: checkOutcome({
        path: atlasPath,
        reported: Boolean(candidate),
        searchListings: activeTrack?.searchListings !== false,
        ...answers,
      }),
    })
  }

  const choosePlatform = (next: PlatformId) => {
    setPlatform(next)
    setResult(null)
    const choices = TRACKS_BY_PLATFORM[next]
    setTrack(choices.length === 1 ? choices[0] : null)
  }
  // The last section, after step 4 whenever step 4 shows.
  const nextSection = activeTrack?.more && working ? 5 : 4

  const tracksHere = platform ? TRACKS_BY_PLATFORM[platform] : []
  const showProblem = addressInput.trim() !== '' && address.problem !== null
  const ready = activeTrack !== null && atlasPath !== null
  const stage = stageBanner(model.stage, activeTrack?.searchListings !== false)
  const verifiedPage = verification?.verified
  const livePage = verifiedPage
    ? `https://${verifiedPage.domain}${verifiedPage.mount}`
    : primaryPageUrl(saved)

  // A lone step, and the unordered follow-on steps, carry no number.
  const stepCard = (step: Step, number: number | null, quiet: boolean) => (
    <StepCard
      embedHeight={embedHeight}
      key={step.id}
      number={number}
      onEmbedHeight={setEmbedHeight}
      onSwitchToIframe={() => choosePlatform('iframe')}
      quiet={quiet}
      status={model.stepStatus[step.id]}
      step={step}
    />
  )

  return (
    <div className={styles.layout}>
      <div className={styles.main}>
        <div className={styles.banners}>
          <InfoBanner
            title={
              // Live means verified, so the verified page is the one to link.
              model.stage === 'verified' && livePage ? (
                <>
                  Your atlas is live at{' '}
                  <a href={livePage} rel="noreferrer" target="_blank">
                    {livePage.replace(/^https:\/\//, '')}
                  </a>
                </>
              ) : (
                stage.title
              )
            }
            type={stage.type}
          >
            {stage.text}
          </InfoBanner>
          {apiKey === null ? (
            <InfoBanner
              action={<a href={editUrl}>Generate one on the Edit tab</a>}
              title="No API key yet"
              type="error"
            >
              Every value below needs one.
            </InfoBanner>
          ) : null}
        </div>

        <section className={styles.section}>
          <h3 className={styles.heading}>
            1. What kind of site is it? <SaveState state={saveState} />
          </h3>
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
              <InfoBanner
                title={activeTrack.caveat.title}
                type={activeTrack.caveat.tone === 'warning' ? 'warning' : 'default'}
              >
                {activeTrack.caveat.text}
              </InfoBanner>
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
            <div className={styles.urlField}>
              <SelectInput
                description="Search engines read your class pages in this language."
                label="Language of your site"
                name="language"
                onChange={(option) =>
                  setLanguage((option as { value?: string } | null)?.value ?? null)
                }
                options={props.languageOptions}
                path="language"
                value={language ?? ''}
              />
            </div>
            <div className={styles.urlField}>
              <TextInput
                Description={
                  <FieldDescription
                    description={regionHelp(props.regionName, activeTrack.classAddresses !== false)}
                    path="region"
                  />
                }
                label="Region"
                path="region"
                readOnly
                value={props.regionName ?? 'Worldwide'}
              />
            </div>
            {hints.length > 0 ? (
              <div className={styles.banners}>
                {hints.map((hint) => (
                  <InfoBanner
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
                  </InfoBanner>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {ready ? (
          <section className={styles.section}>
            <h3 className={styles.heading}>3. Get the atlas on your site</h3>
            {activeTrack.requires ? (
              <InfoBanner
                action={
                  activeTrack.requires.offerIframe ? (
                    <InlineAction onClick={() => choosePlatform('iframe')}>
                      {activeTrack.requires.offerIframe}
                    </InlineAction>
                  ) : undefined
                }
                title={activeTrack.requires.title}
              >
                {activeTrack.requires.text}
              </InfoBanner>
            ) : null}
            <ol className={styles.steps}>
              {activeTrack.steps.map((step, index) =>
                stepCard(step, activeTrack.steps.length === 1 ? null : index + 1, false),
              )}
            </ol>
            {sectionConfirmed(activeTrack.steps, model.stepStatus) ? null : (
              <CheckButton busy={busy} onClick={() => void recheck('section3')} />
            )}
            {result?.from === 'section3' ? <ResultBanner banner={result.banner} /> : null}
          </section>
        ) : null}

        {ready && working && activeTrack.more ? (
          <section className={styles.section}>
            <h3 className={styles.heading}>4. {activeTrack.more.title}</h3>
            <p className={styles.intro}>{activeTrack.more.intro}</p>
            <ol className={styles.steps}>
              {activeTrack.more.steps.map((step) =>
                stepCard(step, null, Boolean(activeTrack.more?.optional)),
              )}
            </ol>
            {activeTrack.more.optional ||
            sectionConfirmed(activeTrack.more.steps, model.stepStatus) ? null : (
              <CheckButton busy={busy} onClick={() => void recheck('section4')} />
            )}
            {result?.from === 'section4' ? <ResultBanner banner={result.banner} /> : null}
          </section>
        ) : null}

        {ready ? (
          <section className={styles.section}>
            <h3 className={styles.heading}>{nextSection}. Make it yours</h3>
            <p className={styles.intro}>
              This is how your map and the emails people get after registering look right now.
              Anything you haven’t chosen yet uses a default.
            </p>
            <AppearancePreview appearance={props.appearance} />
            <div>
              <Button buttonStyle="secondary" el="link" margin={false} url={editUrl}>
                Customize Atlas appearance
              </Button>
            </div>
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

/** How long the address waits after the last keystroke before it is saved. */
const ADDRESS_SAVE_DELAY_MS = 800

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

/**
 * Save part of the record, as the Install tab's choices are made.
 *
 * ⚠ **Payload's own `PATCH /api/clients/:id`, not an endpoint of this tab's.**
 * Field access and hooks apply exactly as they do for the edit form — the
 * Config tab's locks included — so the tab can write nothing a manager could
 * not. `clients` keeps no drafts, so a PATCH is a plain update of the row.
 *
 * Saves run one at a time, in order, so a slow save cannot land after a later
 * one and undo it. `save.flush()` waits for the queue, which is what the Check
 * runs before claiming: the claim reads the saved address, not the typed one.
 */
function useSiteSave(clientId: number) {
  const [state, setState] = useState<SaveStatus>('idle')
  const queue = useRef<Promise<void>>(Promise.resolve())
  const save = useMemo(() => {
    const run = (patch: Record<string, unknown>) => {
      setState('saving')
      queue.current = queue.current.then(async () => {
        try {
          const response = await fetch(`/api/clients/${clientId}?depth=0&select[id]=true`, {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
          })
          setState(response.ok ? 'saved' : 'error')
        } catch {
          setState('error')
        }
      })
    }
    return Object.assign(run, { flush: () => queue.current })
  }, [clientId])
  return { state, save }
}

/** A quiet word beside a heading, saying whether the last change was kept. */
function SaveState({ state }: { state: SaveStatus }) {
  if (state === 'idle') return null
  return (
    <span className={state === 'error' ? styles.saveError : styles.saveState}>
      {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : 'Could not save'}
    </span>
  )
}

/** What the read-only region means for this site. */
function regionHelp(regionName: string | null, classAddresses: boolean): string {
  if (regionName === null) {
    return 'The map opens on the whole world. Only an admin can change this.'
  }
  return classAddresses
    ? `The map opens on ${regionName}, and atlas links for ${regionName} lead to your site once it is confirmed. Only an admin can change this.`
    : `The map opens on ${regionName}. Only an admin can change this.`
}

/** What the address field asks for before anything is typed. */
function addressHelp(platform: PlatformId): string {
  if (platform === 'wix' || platform === 'squarespace') {
    return 'Choose the address your atlas page will have: your domain, then one lowercase word. You will create the page in step 3.'
  }
  if (platform === 'wordpress') {
    return 'Choose the address your atlas page will have. The plugin creates the page for you in step 3.'
  }
  return 'Open the page where the map should appear, and copy its address from your browser’s address bar. No page yet? Type the address it will have.'
}

/** A section's own Check button, the primary action at its foot. */
function CheckButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <div className={styles.checkRow}>
      <Button buttonStyle="primary" disabled={busy} onClick={onClick} size="large">
        {busy ? 'Checking…' : 'Check my site'}
      </Button>
    </div>
  )
}

function ResultBanner({ banner }: { banner: BannerContent }) {
  return (
    <div className={styles.result} role="status">
      <InfoBanner title={banner.title} type={banner.type}>
        {banner.text}
      </InfoBanner>
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
  onSwitchToIframe,
}: {
  number: number | null
  step: Step
  status?: StepStatus
  /** A step nothing checks, in a section where saying so on each one is noise. */
  quiet: boolean
  embedHeight: EmbedHeight
  onEmbedHeight: (next: EmbedHeight) => void
  onSwitchToIframe: () => void
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
            {number === null ? step.title : `${number}. ${step.title}`}
          </span>
        }
        initCollapsed={finished}
      >
        {step.notice ? (
          <div className={styles.stepNotice}>
            <InfoBanner
              action={
                step.notice.offerIframe ? (
                  <InlineAction onClick={onSwitchToIframe}>{step.notice.offerIframe}</InlineAction>
                ) : undefined
              }
              title={step.notice.title}
            >
              {step.notice.text}
            </InfoBanner>
          </div>
        ) : null}
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
  if (typeof action === 'string') {
    return (
      <li>
        <Inline text={action} />
      </li>
    )
  }
  const { text, snippet, download, choice, items } = action
  return (
    <li>
      <Inline text={text} />
      {items ? (
        <ul className={styles.subItems}>
          {items.map((item) => (
            <li key={item}>
              <Inline text={item} />
            </li>
          ))}
        </ul>
      ) : null}
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

/**
 * Step text, with the two marks a step may carry: `**bold**` for a button the
 * volunteer has to find, and `` `code` `` for a name a developer types.
 */
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part, index) =>
        part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
          <strong key={index}>{part.slice(2, -2)}</strong>
        ) : part.startsWith('`') && part.endsWith('`') && part.length > 2 ? (
          <code className={styles.inlineMark} key={index}>
            {part.slice(1, -1)}
          </code>
        ) : (
          part
        ),
      )}
    </>
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
