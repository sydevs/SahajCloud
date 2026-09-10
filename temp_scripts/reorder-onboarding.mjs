// Author the `onboarding` tab's leaves: on-screen order + sections + plain
// descriptions. Keys are the ACTUAL schema keys (the handoff's spec was written
// against the app YAML and assumed finer-grained keys in a few places — e.g. a
// single richText `legal_disclaimer`/`title`/`page_true_self_title` here instead
// of the handoff's split string keys). RichText keys render as their own field
// below the plain rows (mechanism limit), so their description carries the
// on-screen position.
import { applyLeaf, loadFiles, writeFiles } from './reorder-lib.mjs'

const ctx = loadFiles()

// --- welcome ---
applyLeaf(ctx, {
  path: ['onboarding', 'welcome'],
  seedKey: 'onboarding_welcome',
  description: 'First screen new users see — a greeting, sign-up buttons and a short legal notice.',
  spec: [
    ['title', 'Welcome', 'Big greeting at the top of the welcome screen.'],
    ['subtitle', 'Welcome', 'Smaller line below the greeting.'],
    [
      'legal_disclaimer',
      'Legal notice',
      'Small print with Terms and Privacy Policy links. In the app it sits just above the two buttons.',
    ],
    ['get_started', 'Buttons', 'Main button that starts sign-up.'],
    ['use_existing_account', 'Buttons', 'Second button for people who already have an account.'],
    [
      'privacy_policy_title',
      'Legal document screens',
      'Title of the Privacy Policy page opened from the legal links.',
    ],
    [
      'terms_and_conditions_title',
      'Legal document screens',
      'Title of the Terms & Conditions page opened from the legal links.',
    ],
    ['email_app_unavailable', 'Errors', 'Error shown only if the device has no email app to open.'],
    ['link_open_failed', 'Errors', 'Error shown only if a link can’t be opened.'],
  ],
})

// --- name ---
applyLeaf(ctx, {
  path: ['onboarding', 'name'],
  seedKey: 'onboarding_name',
  description: 'Asks the new user for their first name.',
  spec: [
    ['title', '', 'The question at the top of the screen.'],
    ['placeholder', '', 'Grey hint text inside the name box.'],
    ['continue', '', 'Button to move to the next step.'],
  ],
})

// --- greeting ---
applyLeaf(ctx, {
  path: ['onboarding', 'greeting'],
  seedKey: 'onboarding_greeting',
  description: 'Short personal greeting shown after the name step.',
  spec: [
    [
      'message_prefix',
      '',
      'Greeting text. The app adds the user’s name and a “!” straight after it — no name placeholder here.',
    ],
  ],
})

// --- user_type ---
applyLeaf(ctx, {
  path: ['onboarding', 'user_type'],
  seedKey: 'onboarding_user_type',
  description: 'Asks how much experience the user already has.',
  spec: [
    [
      'title',
      'Question',
      'The question at the top (e.g. “Have you tried Sahaja Yoga before?”). Rich text so part of it can be bold.',
    ],
    ['option_complete_beginner', 'Options', 'First option — completely new.'],
    ['option_tried_before', 'Options', 'Second option — tried it once before.'],
    ['option_attending_classes', 'Options', 'Third option — attending classes now.'],
    ['option_yogi', 'Options', 'Fourth option — practising for years.'],
    [
      'get_started',
      'Button',
      'Button at the bottom, shown after an option is chosen. (Appears last on screen.)',
    ],
  ],
})

// --- carousel ---
applyLeaf(ctx, {
  path: ['onboarding', 'carousel'],
  seedKey: 'onboarding_carousel',
  description: 'Three intro slides the user swipes through before signing up.',
  spec: [
    ['page_moment_title', 'Page 1 — A moment of peace', 'Slide 1 title.'],
    ['page_moment_subtitle', 'Page 1 — A moment of peace', 'Slide 1 text under the title.'],
    [
      'page_true_self_title',
      'Page 2 — Get to know your true self',
      'Slide 2 title. Rich text so “true self” can be emphasised.',
    ],
    [
      'page_true_self_subtitle',
      'Page 2 — Get to know your true self',
      'Slide 2 text under the title.',
    ],
    ['page_unlock_potential_title', 'Page 3 — Unlock your potential', 'Slide 3 title.'],
    [
      'page_unlock_potential_subtitle',
      'Page 3 — Unlock your potential',
      'Slide 3 text under the title.',
    ],
  ],
})

// --- consent_modal (label it "Marketing consent"; slug stays put) ---
applyLeaf(ctx, {
  path: ['onboarding', 'consent_modal'],
  seedKey: 'onboarding_consent_modal',
  title: 'Marketing consent',
  description:
    'The marketing-consent screen. ⚠ This wording is saved into each user’s consent record for legal audit — editing it changes what’s recorded, not only what’s shown.',
  spec: [
    ['title', 'Help spread the word', 'Heading of the consent screen.'],
    [
      'body_intro',
      'Help spread the word',
      'Opening paragraph, with a link that shows exactly what is shared.',
    ],
    [
      'body_benefits',
      'Help spread the word',
      'Paragraph on how sharing helps others find the app.',
    ],
    [
      'body_never_share',
      'Help spread the word',
      'Paragraph listing the personal things that are never shared.',
    ],
    [
      'body_never_sell',
      'Help spread the word',
      'Short line promising the app never sells user data.',
    ],
    [
      'body_settings_hint',
      'Help spread the word',
      'Note that this choice can be changed later in settings.',
    ],
    ['allow', 'Buttons', 'Button to allow sharing.'],
    ['reject', 'Buttons', 'Button to decline.'],
  ],
})

writeFiles(ctx)
console.log('\n✓ onboarding written')
