/**
 * The activity-log entry type a repeat signup leaves on the registration it
 * folded into.
 *
 * Two owners, which is why it is here rather than beside either: the
 * `user-submissions` merge hook writes it, and the delivery job reads it to
 * word the manager's notice as an update rather than a new registration.
 * Spelled at both ends, a rename would turn that wording off with nothing to
 * fail.
 */
export const REGISTRATION_UPDATE_LOG_TYPE = 'registration-update'
