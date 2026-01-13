import type { Block } from 'payload'

export const VideoStoryBlock: Block = {
  slug: 'video',
  labels: {
    singular: 'Video Panel',
    plural: 'Video Panels',
  },
  fields: [
    {
      name: 'video',
      type: 'upload',
      relationTo: 'files',
    },
    {
      name: 'text',
      type: 'text',
      label: 'Text',
    },
    {
      name: 'subtitles',
      type: 'json',
      label: 'Subtitles',
      // TODO: Re-enable this (see GitHub issue #137)
      // jsonSchema: {
      //   uri: 'a://b/foo.json', // required
      //   fileMatch: ['a://b/foo.json'], // required
      //   schema: subtitleSchema as JSONSchema4,
      // },
    },
  ],
}
