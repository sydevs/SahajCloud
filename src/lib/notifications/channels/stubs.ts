import type { ReminderPayload, ResolvedRecipient } from '../types'
import type { Payload } from 'payload'

/**
 * Stub for the messaging channels (WhatsApp / Telegram / WeChat). No transport
 * is wired yet — the formatted reminder is logged as a TODO and treated as
 * handled so the lifecycle still progresses and the log records the chosen
 * channel + destination. Real delivery is future work; swap the body in here.
 */
export async function sendStubReminder(
  client: Payload,
  recipient: ResolvedRecipient,
  reminder: ReminderPayload,
): Promise<void> {
  const text = `[${recipient.channel}] ${reminder.eventTitle} — verify: ${reminder.verifyUrl}`
  client.logger.warn({
    msg: `notifications: ${recipient.channel} channel not yet implemented — reminder logged, not delivered`,
    channel: recipient.channel,
    destination: recipient.destination,
    text,
  })
  // Resolve normally: the lifecycle advances and the send is recorded.
  return Promise.resolve()
}
