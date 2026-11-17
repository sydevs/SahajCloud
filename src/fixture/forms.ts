import { plainTextToLexical } from '@/lib/richEditor/plainTextToLexical'

import { ID } from './ids'
import { fixture } from './types'

// `LexicalValue` is an interface, which the generated rich-text type's index signature refuses.
const rich = (text: string) => plainTextToLexical(text) as never

export const FORM_IDS = {
  contact: 1_023_001,
  subscribe: 1_023_002,
  contactDefault: 1_023_003,
} as const

export default fixture('forms', [
  {
    id: FORM_IDS.contact,
    data: {
      title: 'Fixture contact form',
      actionType: 'contact',
      confirmationType: 'redirect',
      redirect: { url: 'https://example.invalid/thanks' },
      recipient: ID.managers.regionManager,
      submitButtonLabel: 'Send message',
      fields: [
        { blockType: 'text', name: 'subject', label: 'Subject' },
        { blockType: 'email', name: 'email', label: 'Email', required: true },
        { blockType: 'textarea', name: 'message', label: 'Message', required: true },
      ],
    },
  },
  {
    id: FORM_IDS.subscribe,
    data: {
      title: 'Fixture subscribe form',
      actionType: 'subscribe',
      confirmationType: 'message',
      confirmationMessage: rich('Thank you. Check your inbox to confirm.'),
      client: ID.clients.first,
      submitButtonLabel: 'Subscribe',
      fields: [{ blockType: 'email', name: 'email', label: 'Email', required: true }],
    },
  },
  // No recipient: the message goes to the shared contact address.
  {
    id: FORM_IDS.contactDefault,
    data: {
      title: 'Fixture general enquiry form',
      actionType: 'contact',
      confirmationType: 'message',
      confirmationMessage: rich('We have your message and will reply soon.'),
      fields: [
        { blockType: 'message', message: rich('Tell us how we can help.') },
        { blockType: 'email', name: 'email', label: 'Email', required: true },
        {
          blockType: 'select',
          name: 'topic',
          label: 'Topic',
          options: [
            { label: 'Classes', value: 'classes' },
            { label: 'Other', value: 'other' },
          ],
        },
        { blockType: 'textarea', name: 'message', label: 'Message', required: true },
      ],
    },
  },
])
