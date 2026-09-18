// Section flags. Archived sections are hidden from the navigation and the routes, but their
// CODE is untouched (pages, components and contexts are all still there) — bringing one back
// just means flipping its flag to true. Mail: at false the section/page/navigation are hidden,
// BUT the AI's ability to write email (MailModal + send_email) keeps working — it isn't tied to this flag.
export const MAIL_ENABLED = false
export const HISTORY_ENABLED = false
