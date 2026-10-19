import './styles.css'

/**
 * How to start an import, with the CSV template to fill in. Shown as the
 * Event Imports list's description and at the top of the upload form, which
 * is also what the Events list's Import menu opens.
 */
export const TemplateLink: React.FC = () => (
  <p className="event-import__note">
    Upload a CSV to add many classes at once. Each row becomes a draft class to review and
    publish from the Events list.{' '}
    <a download href="/event-import-template.csv">
      Download the CSV template
    </a>
    , fill in one row per class, and upload it here.
  </p>
)

export default TemplateLink
