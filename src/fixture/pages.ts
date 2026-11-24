import type { Page } from '@/payload-types'

import { CHOICE, MEDITATION, NODE_PAGES, PAGE } from './content-ids'
import { ID } from './ids'
import { fixture } from './types'

export type Lexical = NonNullable<Page['content']>
type Node = Lexical['root']['children'][number]

export const text = (value: string, format = 0): Node => ({
  type: 'text',
  version: 1,
  text: value,
  format,
  style: '',
  mode: 'normal',
  detail: 0,
})

export const paragraph = (...children: (Node | string)[]): Node => ({
  type: 'paragraph',
  version: 1,
  children: children.map((c) => (typeof c === 'string' ? text(c) : c)),
  direction: 'ltr',
  format: '',
  indent: 0,
  textFormat: 0,
})

export const heading = (tag: 'h2' | 'h3', value: string): Node => ({
  type: 'heading',
  version: 1,
  tag,
  children: [text(value)],
  direction: 'ltr',
  format: '',
  indent: 0,
})

export const link = (value: string, url: string): Node => ({
  type: 'link',
  version: 3,
  fields: { linkType: 'custom', url, newTab: false },
  children: [text(value)],
  direction: 'ltr',
  format: '',
  indent: 0,
})

export const list = (items: string[]): Node => ({
  type: 'list',
  version: 1,
  listType: 'bullet',
  start: 1,
  tag: 'ul',
  direction: 'ltr',
  format: '',
  indent: 0,
  children: items.map((item, i) => ({
    type: 'listitem',
    version: 1,
    value: i + 1,
    children: [text(item)],
    direction: 'ltr',
    format: '',
    indent: 0,
  })),
})

export const upload = (imageId: number, caption: string, align: string): Node => ({
  type: 'upload',
  version: 3,
  format: '',
  id: `fixture-upload-${imageId}-${align}`,
  relationTo: 'images',
  value: imageId,
  fields: { caption, align },
})

export const relation = (relationTo: string, value: number): Node => ({
  type: 'relationship',
  version: 2,
  format: '',
  relationTo,
  value,
})

export const block = (blockType: string, key: string, fields: Record<string, unknown>): Node => ({
  type: 'block',
  version: 2,
  format: '',
  fields: { id: `fixture-${key}`, blockName: '', blockType, ...fields },
})

export const doc = (...children: Node[]): Lexical => ({
  root: { type: 'root', version: 1, children, direction: 'ltr', format: '', indent: 0 },
})

const nodePage = (slug: (typeof NODE_PAGES)[number]['slug']): number =>
  NODE_PAGES.find((n) => n.slug === slug)!.id

/** Plain text as paragraphs, typed to the field (`plainTextToLexical` types its format loosely). */
const plainTextToLexical = (value: string): Lexical =>
  doc(...value.split('\n').map((line) => paragraph(line)))

export default fixture('pages', [
  // Published in English and German: the two locales show independent publish state.
  {
    id: PAGE.welcome,
    data: {
      _status: 'published',
      title: 'Welcome to meditation',
      slug: 'fixture-welcome-to-meditation',
      tags: ['wisdom', 'lifestyle'],
      author: ID.authors.first,
      featuredVideo: ID.videos.first,
      managers: [ID.managers.contentEditor],
      content: doc(
        heading('h2', 'Where to begin'),
        paragraph(
          'Meditation is a state of inner stillness. ',
          text('It needs no belief and no experience', 1),
          ', only a few quiet minutes and some curiosity.',
        ),
        upload(ID.images.landscape, 'A quiet landscape at dawn', 'wide'),
        paragraph('Three things help a first session:'),
        list(['A place where you will not be disturbed', 'A comfortable chair', 'Ten minutes']),
        block('quote', 'welcome-quote', {
          title: 'A thought to start with',
          text: 'Stillness is not the absence of thought. It is the thought-free space between thoughts.',
          credit: 'Fixture Teacher',
          caption: 'From a fixture talk',
        }),
        // Slugifies to `where-to-begin`, the same as the heading above it: the pair
        // is what shows that a table-of-contents entry names which occurrence of
        // its slug it is, not just the slug.
        heading('h2', 'Where to begin?'),
        paragraph(
          'Read more in ',
          link('our guide to technique', 'https://example.invalid/technique'),
          '.',
        ),
        block('button', 'welcome-button', {
          text: 'Start the first meditation',
          url: 'https://example.invalid/start',
        }),
        block('table-of-contents', 'welcome-toc', {
          title: 'In this article',
          headings: [
            { slug: 'where-to-begin', text: 'Where to begin', level: 2, occurrence: 0 },
            { slug: 'where-to-begin', text: 'Where to begin?', level: 2, occurrence: 1 },
          ],
        }),
      ),
    },
    locales: {
      de: {
        _status: 'published',
        title: 'Willkommen zur Meditation',
        content: doc(
          heading('h2', 'Wo man anfängt'),
          paragraph(
            'Meditation ist ein Zustand innerer Stille. Es braucht nur ein paar ruhige Minuten.',
          ),
        ),
      },
    },
  },
  // A landing page built from most of the layout blocks.
  {
    id: PAGE.landing,
    data: {
      _status: 'published',
      title: 'Find your practice',
      slug: 'fixture-find-your-practice',
      tags: ['lifestyle'],
      content: doc(
        block('splash', 'landing-splash', {
          layout: 'default',
          textColor: 'light',
          images: [ID.images.landscape, ID.images.square],
          title: 'Find your practice',
          subtitle: 'Guided sessions for every mood',
          actionText: 'Browse meditations',
          actionURL: 'https://example.invalid/meditations',
        }),
        block('textbox', 'landing-textbox-left', {
          image: ID.images.portrait,
          imagePosition: 'left',
          textPosition: 'left',
          textColor: 'dark',
          wisdomStyle: true,
          title: 'Ancient wisdom',
          subtitle: 'Why it works',
          text: 'Meditation has been practised for thousands of years.',
          buttonText: 'Learn more',
          buttonUrl: 'https://example.invalid/wisdom',
        }),
        block('textbox', 'landing-textbox-overlay', {
          image: ID.images.landscape,
          imagePosition: 'overlay',
          textPosition: 'center',
          textColor: 'light',
          title: 'Quiet your mind',
          text: 'A short session can change the shape of a day.',
        }),
        block('textbox', 'landing-textbox-right', {
          image: ID.images.square,
          imagePosition: 'right',
          textPosition: 'right',
          textColor: 'dark',
          text: 'Every session ends with a minute of silence.',
        }),
        block('showcase', 'landing-showcase', {
          items: [
            { relationTo: 'meditations', value: ID.meditations.first },
            { relationTo: 'meditations', value: MEDITATION.dailyEnglish },
            { relationTo: 'pages', value: PAGE.welcome },
          ],
        }),
        block('content-index', 'landing-index-meditations', {
          type: 'meditations',
          limit: 6,
          userChoiceFilters: [CHOICE.calm],
        }),
        block('content-index', 'landing-index-pages', {
          type: 'pages',
          limit: 4,
          pageFilters: ['wisdom', 'technique'],
        }),
        block('content-index', 'landing-index-songs', {
          type: 'songs',
          limit: 5,
          songFilters: [ID.songTags.first],
        }),
        block('content-index', 'landing-index-lectures', { type: 'lectures', limit: 3 }),
        block('content-index', 'landing-index-user-choices', {
          type: 'user-choices',
          limit: 20,
          userChoiceTypeFilters: ['mood'],
          userChoiceFeatured: 'featured',
        }),
      ),
    },
  },
  {
    id: PAGE.creative,
    data: {
      _status: 'published',
      title: 'Creativity and stillness',
      slug: 'fixture-creativity-and-stillness',
      tags: ['creativity'],
      author: ID.authors.second,
      content: doc(
        heading('h2', 'The quiet before the idea'),
        paragraph('Many makers describe a moment of silence before the work begins.'),
        block('image-gallery', 'creative-gallery', {
          items: [ID.images.landscape, ID.images.portrait, ID.images.square],
        }),
        relation('pages', PAGE.welcome),
      ),
    },
  },
  // Published in English, and in Spanish with its own title.
  {
    id: PAGE.technique,
    data: {
      _status: 'published',
      title: 'Hands on the earth',
      slug: 'fixture-hands-on-the-earth',
      tags: ['technique', 'wisdom'],
      author: ID.authors.third,
      content: plainTextToLexical(
        'Place your left hand towards the sky and your right hand on the earth.\nStay with the sensation for a minute.',
      ),
    },
    locales: {
      es: {
        _status: 'published',
        title: 'Las manos sobre la tierra',
        content: plainTextToLexical(
          'Coloca la mano izquierda hacia el cielo y la derecha sobre la tierra.',
        ),
      },
    },
  },
  // A draft with no published locale.
  {
    id: PAGE.retreat,
    data: {
      _status: 'draft',
      title: 'Upcoming weekend retreat',
      slug: 'fixture-upcoming-weekend-retreat',
      tags: ['event'],
      content: plainTextToLexical('Details of the weekend retreat will be announced soon.'),
    },
  },
  {
    id: PAGE.layouts,
    data: {
      _status: 'published',
      title: 'Layout gallery',
      slug: 'fixture-layout-gallery',
      tags: ['lifestyle', 'creativity'],
      content: doc(
        block('layout', 'layouts-grid', {
          style: 'grid',
          title: 'Grid',
          items: [
            {
              id: 'fixture-grid-1',
              image: ID.images.square,
              title: 'Morning',
              titleUrl: 'https://example.invalid/morning',
              text: 'Start the day clear.',
            },
            {
              id: 'fixture-grid-2',
              image: ID.images.landscape,
              title: 'Evening',
              text: 'Let the day go.',
            },
          ],
        }),
        block('layout', 'layouts-tabs', {
          style: 'tabs',
          title: 'Tabs',
          defaultTab: 'Basics',
          useColumnsOnDesktop: true,
          items: [
            { id: 'fixture-tab-1', title: 'Basics', text: 'Sit comfortably.' },
            { id: 'fixture-tab-2', title: 'Going deeper', text: 'Stay a little longer.' },
          ],
        }),
        block('layout', 'layouts-accordion', {
          style: 'accordion',
          items: [
            {
              id: 'fixture-acc-1',
              title: 'How long should I sit?',
              text: 'Ten minutes is a good start.',
            },
            {
              id: 'fixture-acc-2',
              title: 'Do I need a teacher?',
              text: 'A guide can help, but is not required.',
            },
          ],
        }),
        block('layout', 'layouts-list', {
          style: 'list',
          items: [
            {
              id: 'fixture-list-1',
              image: ID.images.portrait,
              title: 'Hands',
              text: 'Resting open on the knees.',
            },
          ],
        }),
        block('layout', 'layouts-textlist', {
          style: 'textList',
          items: [
            { id: 'fixture-text-1', text: 'Close your eyes.' },
            { id: 'fixture-text-2', text: 'Breathe naturally.' },
          ],
        }),
        block('splash', 'layouts-splash-countdown', {
          layout: 'countdown',
          textColor: 'dark',
          images: [ID.images.square],
          title: 'Next live session',
          actionText: 'Join',
          actionURL: 'https://example.invalid/live',
        }),
        block('splash', 'layouts-splash-app', {
          layout: 'app',
          textColor: 'light',
          images: [ID.images.portrait],
          title: 'Meditate anywhere',
        }),
        block('splash', 'layouts-splash-map', {
          layout: 'map-search',
          textColor: 'dark',
          images: [ID.images.landscape],
        }),
      ),
    },
  },
  {
    id: PAGE.subtleOverview,
    data: {
      _status: 'published',
      title: 'The subtle system',
      slug: 'fixture-the-subtle-system',
      tags: ['wisdom'],
      content: doc(
        paragraph('The subtle system is described through three channels and seven centres.'),
        block('subtle-system', 'overview-subtle', {
          left: nodePage('ida'),
          right: nodePage('pingala'),
          center: nodePage('sushumna'),
          mooladhara: nodePage('mooladhara'),
          kundalini: nodePage('kundalini'),
          swadhistan: nodePage('swadhistan'),
          nabhi: nodePage('nabhi'),
          void: nodePage('void'),
          anahat: nodePage('anahat'),
          vishuddhi: nodePage('vishuddhi'),
          agnya: nodePage('agnya'),
          sahasrara: nodePage('sahasrara'),
        }),
        block('content-index', 'overview-index', {
          type: 'meditations',
          limit: 3,
          userChoiceFilters: [CHOICE.deepen],
        }),
      ),
    },
  },
  ...NODE_PAGES.map((node) => ({
    id: node.id,
    data: {
      _status: 'published' as const,
      title: node.title,
      slug: `fixture-node-${node.slug}`,
      tags: ['wisdom' as const],
      content: plainTextToLexical(`A short description of ${node.title.toLowerCase()}.`),
    },
  })),
])
