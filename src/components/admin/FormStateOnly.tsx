/**
 * A field component that renders nothing, for a field whose value the edit view
 * needs in form state but shows somewhere else.
 *
 * Not `admin.hidden`: that also drops the field from the list view's columns
 * and filters. `user-submissions.status` is the case — the status banner and
 * the review buttons read it from form state, and the list keeps its column.
 */
const FormStateOnly = () => null

export default FormStateOnly
