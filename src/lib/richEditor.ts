import {
  lexicalEditor,
  BoldFeature,
  ItalicFeature,
  UnorderedListFeature,
  OrderedListFeature,
  LinkFeature,
  BlockquoteFeature,
  InlineToolbarFeature,
  BlocksFeature,
  RelationshipFeature,
  HeadingFeature,
  UploadFeature,
} from '@payloadcms/richtext-lexical'
import { Block } from 'payload'

/**
 * Basic rich text configuration with minimal features
 * Features: Bold, Italic, Link, and InlineToolbar
 */
export const basicRichTextEditor = lexicalEditor({
  features: () => [BoldFeature(), ItalicFeature(), LinkFeature(), InlineToolbarFeature()],
})

/**
 * Full rich text configuration with all features including blocks
 * Features: All basic formatting + Lists, Blockquote, Heading, Upload, Relationship, and Blocks
 */
export const fullRichTextEditor = (blocks?: Block[]) =>
  lexicalEditor({
    features: () => [
      BoldFeature(),
      ItalicFeature(),
      UnorderedListFeature(),
      OrderedListFeature(),
      LinkFeature(),
      BlockquoteFeature(),
      InlineToolbarFeature(),
      HeadingFeature({ enabledHeadingSizes: ['h1', 'h2'] }),
      RelationshipFeature({
        enabledCollections: ['meditations', 'pages', 'forms'],
        maxDepth: 1,
      }),
      UploadFeature({
        collections: {
          media: { fields: [] },
          music: { fields: [] },
        },
      }),
      ...(blocks ? [BlocksFeature({ blocks })] : []),
    ],
  })
