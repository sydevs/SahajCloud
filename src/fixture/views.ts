/**
 * Where a reviewer sees each custom admin component, on fixture data.
 *
 * Keyed by the component's path in `src/app/(payload)/admin/importMap.js`. A
 * value lists admin paths that render it — `/admin/collections/<slug>/<id>…`
 * names a fixture row — or says, in `none`, why it has no page of its own (a
 * cell, an icon, a provider). The coverage guard fails on a component missing
 * here, and on a link to a row the fixture does not have.
 */
export type ViewRegistry = Record<string, { links: string[] } | { none: string }>

const doc = (slug: string, id: number, tail = '') => `/admin/collections/${slug}/${id}${tail}`
const list = (slug: string) => `/admin/collections/${slug}`
const globalDoc = (slug: string) => `/admin/globals/${slug}`

const links = (...paths: string[]) => ({ links: paths })

// Events, by the state each one stands in.
const EVENT_THURSDAY = 1_025_001 // verified, offline, weekly, with registrations
const EVENT_ONLINE = 1_025_002 // verified, online, daily
const EVENT_REMINDED = 1_025_003
const EVENT_ESCALATED = 1_025_004
const EVENT_URGENT = 1_025_005
const EVENT_EXPIRED = 1_025_006

// Regions.
const REGION_COUNTRY = 1_002_001
const REGION_CITY = 1_002_002
const REGION_REGION = 1_002_004

// Clients.
const CLIENT_FIRST = 1_022_001 // atlas, mailchimp, own colours
const CLIENT_SECOND = 1_022_002
const CLIENT_MIXED = 1_022_005 // web + atlas, cleverreach
const CLIENT_APP_ONLY = 1_022_004 // no atlas role
const CLIENT_DORMANT = 1_022_006
const CLIENT_HOSTED = 1_022_007
const CLIENT_EMPTY_REGION = 1_022_008 // atlas, region with nothing published

export const VIEWS: ViewRegistry = {
  // Chrome on every admin page.
  '@/components/AdminProvider.tsx#default': { none: 'a provider, renders no markup of its own' },
  '@/components/admin/AdminNavLinks#default': links('/admin'),
  '@/components/admin/ProjectSelector#default': links('/admin'),
  '@/components/admin/AtlasNav/AtlasNav#default': links('/admin'),
  '@/components/branding/Logo#default': links('/admin'),
  '@/components/branding/Icon#default': links('/admin'),
  '@/components/admin/SignIn#default': { none: 'the sign-in view, unreachable once signed in' },
  '@/components/admin/NeedHelpButton#default': links('/admin'),

  // Root views.
  '@/components/admin/Dashboard/DashboardView#default': links(
    '/admin',
    `/admin?region=${REGION_CITY}`,
  ),
  '@/components/admin/AnalyticsView#default': links('/admin/analytics'),
  '@/components/admin/AtlasMapView#default': links('/admin/map'),

  // Events.
  '@/components/admin/EventRegistrations#default': links(
    doc('events', EVENT_THURSDAY, '/registrations'),
    doc('events', EVENT_ONLINE, '/registrations'),
    doc('events', EVENT_REMINDED, '/registrations'),
  ),
  '@/components/admin/EventRegistrations/RegistrationsNotice#default': links(
    doc('events', EVENT_THURSDAY),
  ),
  '@/components/admin/EventRegistrations/RegistrationsPill#default': links(
    doc('events', EVENT_THURSDAY),
  ),
  '@/components/admin/EventQualityPanel#default': links(
    doc('events', EVENT_THURSDAY),
    doc('events', 1_025_010),
  ),
  '@/components/admin/EventVerificationNotice#default': links(
    doc('events', EVENT_REMINDED),
    doc('events', EVENT_ESCALATED),
    doc('events', EVENT_URGENT),
    doc('events', EVENT_EXPIRED),
  ),
  '@/components/admin/VerificationStageField#default': links(
    doc('events', EVENT_THURSDAY),
    doc('events', EVENT_REMINDED),
    doc('events', EVENT_URGENT),
  ),
  '@/components/admin/InfoBanner#default': links(doc('events', EVENT_THURSDAY)),
  '@/components/admin/ManagerContacts#default': links(
    doc('events', EVENT_THURSDAY),
    doc('regions', REGION_CITY),
  ),
  '@/components/admin/LogTable#default': links(
    doc('events', EVENT_THURSDAY),
    doc('events', EVENT_REMINDED),
    doc('user-submissions', 1_026_040),
  ),
  '@/components/admin/AddressSearchField#default': links(
    doc('events', EVENT_THURSDAY),
    doc('regions', REGION_CITY),
  ),
  '@/components/admin/StringSelectField#default': links(doc('events', EVENT_THURSDAY)),
  '@/components/admin/FlatArrayField#default': links(
    doc('events', EVENT_THURSDAY),
    doc('app-cards', 1_021_004),
  ),
  '@/components/admin/ScheduleSummary#default': links(doc('app-cards', 1_021_004)),
  '@/components/admin/ScheduleSummary/IntervalLabel#default': links(
    doc('events', EVENT_THURSDAY),
    doc('events', EVENT_ONLINE),
    doc('app-cards', 1_021_004),
  ),
  '@/components/admin/EventFrequencyField#default': links(
    doc('events', EVENT_THURSDAY),
    doc('events', EVENT_ONLINE),
    doc('events', 1_025_015),
    doc('events', 1_025_007),
  ),
  '@/components/admin/EventScheduleNotice#default': links(
    doc('events', EVENT_THURSDAY),
    doc('events', EVENT_ONLINE),
    doc('events', 1_025_015),
    doc('events', 1_025_007),
  ),
  '@/components/admin/EventImport/ImportListMenuItem#default': links(list('events')),

  // Regions.
  '@/components/admin/EventImport/ImportClassesMenuItem#default': links(
    doc('regions', REGION_COUNTRY),
    doc('regions', REGION_CITY),
  ),
  '@/components/admin/RegionCreatePrefill#default': links(
    `/admin/collections/regions/create?level=city&parent=${REGION_COUNTRY}`,
  ),
  '@/components/admin/RegionEvents#default': links(
    doc('regions', REGION_COUNTRY),
    doc('regions', REGION_CITY),
  ),
  '@/components/admin/AddChildRegionButton#default': links(
    doc('regions', REGION_COUNTRY),
    doc('regions', REGION_REGION),
    doc('regions', REGION_CITY),
  ),
  '@/components/admin/LockedSlugField#default': links(
    doc('regions', REGION_CITY),
    doc('pages', 1_014_001),
    doc('user-choices', 1_010_002),
    doc('authors', 1_007_001),
    doc('song-tags', 1_009_001),
  ),

  // Imports.
  '@/components/admin/EventImport/ImportResultsField#default': links(
    doc('imports', 1_024_001),
    doc('imports', 1_024_002),
    doc('imports', 1_024_003),
    doc('imports', 1_024_005),
  ),
  '@/components/admin/EventImport/TemplateLink#default': links(
    list('imports'),
    '/admin/collections/imports/create',
  ),
  '@/components/admin/JobStageView/JobStageView#default': links(
    doc('imports', 1_024_004),
    doc('imports', 1_024_001),
    doc('transcripts', 1_016_001),
  ),

  // Managers.
  '@/components/admin/RolesField#default': links(
    doc('managers', 1_001_002),
    doc('managers', 1_001_003),
    doc('managers', 1_001_005),
  ),
  '@/components/admin/PermissionsTable#default': links(
    doc('managers', 1_001_002),
    doc('clients', CLIENT_FIRST),
  ),
  // Shows only to a non-admin, in the manager drawer an event's Manager field
  // opens — sign in as 1001002 and open its manager, 1001006.
  '@/components/admin/ManagerEditNotice#default': links(doc('events', EVENT_ESCALATED)),
  '@/components/admin/NotificationPreferences#default': links(
    doc('managers', 1_001_002),
    doc('managers', 1_001_003),
  ),

  // Clients.
  '@/components/admin/InstallGuide/InstallView#default': links(
    doc('clients', CLIENT_FIRST, '/install'),
    doc('clients', CLIENT_DORMANT, '/install'),
    doc('clients', CLIENT_HOSTED, '/install'),
    doc('clients', CLIENT_APP_ONLY, '/install'),
  ),
  '@/components/admin/InstallGuide/InstallBanner#default': links(
    doc('clients', CLIENT_DORMANT),
    doc('clients', CLIENT_HOSTED),
    doc('clients', CLIENT_FIRST),
  ),
  '@/components/admin/InstallGuide/InstallSummary#default': links(
    doc('clients', CLIENT_FIRST),
    doc('clients', CLIENT_HOSTED),
    doc('clients', CLIENT_MIXED),
  ),
  '@/components/admin/AtlasPreview/BrandingColorsLabel#default': links(
    doc('clients', CLIENT_FIRST),
    doc('clients', CLIENT_SECOND),
  ),
  '@/components/admin/AtlasPreview/AdjustedColors#default': links(
    doc('clients', CLIENT_FIRST),
    doc('clients', CLIENT_SECOND),
  ),
  '@/components/admin/AtlasPreview/MapPreviewField#default': links(
    doc('clients', CLIENT_FIRST),
    doc('clients', CLIENT_EMPTY_REGION),
  ),
  '@/components/admin/AtlasPreview/EmailPreviewField#default': links(doc('clients', CLIENT_FIRST)),
  '@/components/admin/SecretField#default': links(
    doc('clients', CLIENT_FIRST),
    doc('clients', CLIENT_MIXED),
  ),
  '@/components/admin/AbuseScore/AbuseScoreField#default': links(
    doc('clients', CLIENT_FIRST),
    doc('clients', CLIENT_DORMANT),
  ),
  '@/components/admin/AbuseScore/AbuseScoreCell#default': links(list('clients')),
  '@/components/admin/ColorField/ColorField#default': links(
    doc('clients', CLIENT_FIRST),
    doc('user-choices', 1_010_002),
  ),
  '@/components/admin/ColorField/ColorCell#default': links(list('user-choices')),

  // Selects and shared fields, wherever a collection declares them.
  '@/components/admin/SelectDescription#default': links(
    doc('clients', CLIENT_FIRST),
    doc('meditations', 1_015_001),
    doc('imports', 1_024_003),
    doc('pages', 1_014_006),
  ),
  '@/components/admin/ToggleGroupField#default': links(
    doc('managers', 1_001_002),
    doc('regions', REGION_CITY),
    doc('events', EVENT_THURSDAY),
    doc('app-cards', 1_021_001),
    doc('lectures', 1_019_001),
    doc('user-choices', 1_010_002),
    doc('meditations', 1_015_001),
    doc('videos', 1_013_001),
    doc('pages', 1_014_002),
  ),
  '@/components/admin/PreviewTarget#default': links(
    doc('meditations', 1_015_001),
    doc('clients', CLIENT_FIRST),
    doc('user-submissions', 1_026_040),
    doc('user-submissions', 1_026_020),
    globalDoc('wm-web-translations'),
  ),

  // Content.
  '@/components/admin/TableOfContentsField#default': links(doc('pages', 1_014_001)),
  '@/components/admin/AudioUpload#default': links(
    doc('meditations', 1_015_001),
    doc('songs', 1_018_001),
  ),
  '@/components/admin/TagSelector#default': links(
    doc('meditations', 1_015_001),
    doc('songs', 1_018_001),
  ),
  '@/components/admin/TagAssignmentField#default': links(doc('meditations', 1_015_001)),
  '@/components/admin/FrameEditor/FrameListManager#default': links(
    doc('meditations', 1_015_001),
    doc('meditations', 1_015_003),
  ),
  '@/components/admin/FrameEditor/FrameInserter#default': links(doc('meditations', 1_015_001)),
  '@/components/admin/WorkflowButtons#default': links(
    doc('meditations', 1_015_001),
    doc('meditations', 1_015_003),
    doc('user-submissions', 1_026_040),
    doc('user-submissions', 1_026_041),
    doc('user-submissions', 1_026_023),
    '/admin/collections/meditations/create',
  ),
  '@/components/admin/TranscriptPanel#MeditationTranscriptField': links(
    doc('meditations', 1_015_001),
    doc('meditations', 1_015_002),
  ),
  '@/components/admin/TranscriptPanel#FileTranscriptField': links(
    doc('files', 1_005_002),
    doc('files', 1_005_010),
    doc('lessons', 1_020_003),
  ),
  '@/components/admin/TranscriptPanel#RecordingLanguageWarning': links(
    // The step's intro audio is English, so any other editing locale warns.
    `${doc('lessons', 1_020_003)}?locale=de`,
  ),
  '@/components/admin/TimestampInput#default': links(
    doc('lectures', 1_019_001),
    doc('lectures', 1_019_004),
  ),
  '@/components/admin/AppCardViewSchedule#default': links(
    doc('app-cards', 1_021_004),
    doc('app-cards', 1_021_005),
    doc('app-cards', 1_021_008),
  ),
  '@/components/admin/RangeSlider#default': links(
    doc('app-cards', 1_021_005),
    doc('app-cards', 1_021_006),
  ),
  '@/components/admin/VariableInsert#default': links(doc('app-cards', 1_021_001)),
  '@/components/admin/UploadNotice#default': links(
    doc('images', 1_004_001),
    doc('files', 1_005_001),
    doc('videos', 1_013_001),
  ),
  // Mounted on every entity declaring `admin.livePreview`, one watched surface
  // of each kind here.
  '@/components/admin/LivePreviewNotice#default': links(
    doc('clients', CLIENT_FIRST),
    doc('regions', REGION_CITY),
    doc('pages', 1_014_001),
    doc('user-submissions', 1_026_040),
  ),

  // List cells.
  '@/components/admin/RelationshipCountCell#default': links(
    list('albums'),
    list('audiences'),
    list('authors'),
    list('song-tags'),
    list('subtle-system-nodes'),
    list('user-choices'),
  ),
  '@/components/admin/ThumbnailCell/RelationshipThumbnailCell#default': links(
    list('videos'),
    list('lectures'),
    list('albums'),
    list('authors'),
  ),
  '@/components/admin/ThumbnailCell/PreviewUrlThumbnailCell#default': links(
    list('files'),
    list('videos'),
    list('frames'),
  ),

  // Submissions and users.
  '@/components/admin/SubmissionReview/SubmissionSummary#default': links(
    doc('user-submissions', 1_026_040),
    doc('user-submissions', 1_026_001),
    doc('user-submissions', 1_026_020),
    doc('user-submissions', 1_026_030),
  ),
  '@/components/admin/SubmissionReview/SubmissionData#default': links(
    doc('user-submissions', 1_026_001),
    doc('user-submissions', 1_026_020),
    doc('user-submissions', 1_026_030),
    doc('user-submissions', 1_026_040),
  ),
  '@/components/admin/SubmissionReview/SubmissionChanges#default': links(
    doc('user-submissions', 1_026_040),
    doc('user-submissions', 1_026_041),
    doc('user-submissions', 1_026_042),
  ),
  '@/components/admin/SubmissionReview/SubmissionStatus#default': links(
    doc('user-submissions', 1_026_005),
    doc('user-submissions', 1_026_006),
    doc('user-submissions', 1_026_001),
  ),
  '@/components/admin/BlockUserButton#default': links(
    doc('users', 1_003_007),
    doc('users', 1_003_001),
    doc('user-submissions', 1_026_020),
  ),

  // Globals.
  '@/components/admin/ReadinessField#default': links(globalDoc('wm-app-status')),
  '@/components/admin/ReadinessField/ReadinessBanner#default': links(globalDoc('wm-app-status')),
  '@/components/admin/TabScreenshot#default': links(
    globalDoc('wm-web-translations'),
    globalDoc('wm-app-translations'),
    globalDoc('sy-atlas-translations'),
  ),
  '@/components/admin/TranslationsRow#default': links(
    globalDoc('wm-web-translations'),
    globalDoc('wm-app-translations'),
    globalDoc('sy-atlas-translations'),
  ),
  '@/components/admin/TranslationsRow#TranslationsRichTextField': links(
    globalDoc('wm-web-translations'),
    globalDoc('wm-app-translations'),
    globalDoc('sy-atlas-translations'),
  ),
}
