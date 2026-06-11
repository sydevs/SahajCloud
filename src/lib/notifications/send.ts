import type { ReminderPayload, ResolvedRecipient } from './types'
import type { Payload } from 'payload'

import { sendEmailReminder } from './channels/email'
import { sendStubReminder } from './channels/stubs'

/**
 * Thin dispatch over a recipient's resolved channel. Returns whether the send
 * was handled — the job logs + advances only handled recipients, so a
 * failed/throwing send is retried (for un-logged recipients only) on the next
 * run. Errors are caught + logged, never thrown, so one bad recipient doesn't
 * abort the batch.
 */
export async function sendNotification(args: {
  client: Payload
  recipient: ResolvedRecipient
  reminder: ReminderPayload
}): Promise<boolean> {
  const { client, recipient, reminder } = args
  try {
    if (recipient.channel === 'email') {
      await sendEmailReminder(client, recipient, reminder)
    } else {
      await sendStubReminder(client, recipient, reminder)
    }
    return true
  } catch (error) {
    client.logger.error({
      msg: 'notifications: send failed',
      channel: recipient.channel,
      destination: recipient.destination,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}
