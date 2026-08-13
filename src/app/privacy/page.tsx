import Link from "next/link";
export const metadata = { title: "Privacy, in plain language" };
export default function Privacy() {
  return (
    <main className="legal-page">
      <header>
        <Link href="/" className="brand">
          ↗ replylane.
        </Link>
      </header>
      <span className="eyebrow">YOUR INBOX STAYS YOURS</span>
      <h1>Privacy, in plain language.</h1>
      <p className="legal-date">Project notice · October 21, 2026</p>
      <p>
        Replylane is an open-source job application email organizer. This notice describes the
        software’s behavior. The person operating a live deployment is responsible for identifying
        themselves, providing a privacy contact, selecting service regions, and supplying the
        notices appropriate for their users before accepting public registrations.
      </p>
      <h2>What you connect</h2>
      <p>
        Account sign-in is separate from inbox access. Gmail uses Google’s read-only Gmail scope.
        Microsoft uses delegated Mail.Read and User.Read with offline access. IMAP connections use
        TLS on port 993 and open the Inbox read-only. The software does not send email, change read
        status, delete mail, or move messages.
      </p>
      <h2>How messages are organized</h2>
      <p>
        When you connect an inbox or start an import, the backend sends our external processing
        service a shortened message excerpt, subject, sender display name, and received date to
        decide whether the email is about a job application. Email addresses and links in the
        submitted text are replaced where recognized. Redaction is limited and does not remove every
        possible personal detail. Unrelated emails within your selected range may also reach the
        classifier before being excluded. Attachments are not submitted.
      </p>
      <p>
        Processing runs on a hosted service with data-retention controls. Deployment owners should
        enable Zero Data Retention and review their service agreement before activating real mail
        processing. This app does not use email to train models or enable model tuning.
      </p>
      <h2>What is saved</h2>
      <p>
        Firebase Authentication stores your sign-in account. Firestore stores connected inbox
        metadata, encrypted refresh tokens or IMAP passwords, import cursors, usage counts, and
        processing receipts. Application responses create cards with company, role, sender, date,
        language, classification, summary, next step, short plain-text excerpt, and any notes or
        corrections you add. Irrelevant message bodies are discarded; an identifier receipt remains
        to avoid processing them again.
      </p>
      <p>
        Credentials are encrypted on the server using AES-256-GCM with a deployment secret. Email
        excerpts and notes are readable by the app’s backend and stored using Firestore’s managed
        encryption. This is not end-to-end encryption. The browser cannot access Firestore directly.
        API access requires a verified, authenticated account and is restricted to that account’s
        records.
      </p>
      <h2>Your choices</h2>
      <p>
        Choose new mail only, the last 30 days, or the last 60 days. Pause a connection to stop
        scheduled processing. Disconnect to remove its stored credentials. Existing application
        cards remain available. Export your application data as CSV, or permanently delete your
        account and workspace in Settings. You can revoke OAuth access or app passwords in your
        email provider’s security settings too.
      </p>
      <p>
        Messages already being fetched or classified when you pause or disconnect may complete that
        external request. The app checks connection and account state again before writing results.
        Disconnecting does not itself revoke the provider’s authorization. Provider logs,
        infrastructure backups, and retention schedules are governed by the services and deployment
        owner.
      </p>
      <h2>Browser storage and logs</h2>
      <p>
        The theme and board/list preference are stored locally. Firebase manages authentication storage
        for signed-in users. There are no advertising or analytics trackers in this project. The app’s
        own error logs omit message content and credentials; hosting services may still retain
        request metadata.
      </p>
      <h2>AI can be wrong</h2>
      <p>
        Confidence scores are model estimates. Uncertain results go to review, but a high score does
        not guarantee correctness. Read the original before responding, attending an interview, or
        acting on an offer. You can manually correct any card.
      </p>
      <h2>Before a public launch</h2>
      <p>
        A live operator must supply their identity and contact details here, validate deletion and
        retention with their hosting setup, complete applicable email provider verification, and
        ensure that the provider data-processing arrangements fit the intended audience. This
        project notice does not claim those steps have already been completed.
      </p>
    </main>
  );
}
