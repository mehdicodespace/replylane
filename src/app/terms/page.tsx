import Link from "next/link";
export const metadata = { title: "Terms of use" };
export default function Terms() {
  return (
    <main className="legal-page">
      <header>
        <Link href="/" className="brand">
          ↗ replylane.
        </Link>
        <Link href="/">Back to home ↗</Link>
      </header>
      <span className="eyebrow">A FEW CLEAR EXPECTATIONS</span>
      <h1>Terms of use.</h1>
      <p className="legal-date">Project terms · October 21, 2026</p>
      <p>
        Replylane is an early open-source application for organizing your own job application
        responses. Its sample workspace can be explored without connecting an account. Live service
        availability depends on the operator and their configured third-party providers.
      </p>
      <h2>Your account and inbox</h2>
      <p>
        Only connect mailboxes you are authorized to access. Keep your account credentials private.
        Use the connection process to grant the minimum access needed. Account sign-in does not
        automatically grant access to your email inbox.
      </p>
      <h2>What the service provides</h2>
      <p>
        The app classifies email text, displays application information, and helps you organize
        follow-ups. It does not apply for roles, contact recruiters, schedule meetings, or make
        employment decisions. AI summaries and classifications can be incomplete or incorrect.
        Verify important information in your original email.
      </p>
      <h2>Availability and limits</h2>
      <p>
        Imports and syncing run within shared AI, hosting, and database limits. Queued messages may
        be delayed. Scheduled checks are periodic, not instantaneous. Provider outages, revoked
        credentials, exceeded allowances, and deployment configuration can interrupt processing.
        Free-tier capacity is not guaranteed.
      </p>
      <h2>Your information</h2>
      <p>
        The <Link href="/privacy">privacy notice</Link> explains what information is processed and
        stored. Inbox processing requires separate consent. You may pause or disconnect your mailbox
        and export or delete your workspace.
      </p>
      <h2>Using the source</h2>
      <p>
        The repository is distributed under its MIT license. A self-hosted deployment is operated
        independently by its owner. Before offering a public service, that owner must replace
        project-level notices with their own operator details and appropriate terms.
      </p>
      <h2>Early software</h2>
      <p>
        This software is provided as available, without a promise of uninterrupted operation or
        perfect classification. Keep your original email as the authoritative record. These project
        terms do not claim that this deployment has completed a production security audit or
        provider verification.
      </p>
    </main>
  );
}
