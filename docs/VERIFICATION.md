# Verification record

October 21, 2026. Checks were run locally against the shipped source and production build.

## Automated

- TypeScript strict checking passed, including unused-local/parameter checks.
- 58 tests passed across five files.
- `next build` completed and generated the marketing, account, and workspace pages plus server routes.
- `npm audit --omit=dev` reported zero known production dependency vulnerabilities at the time of the check.
- Public pages returned HTTP 200. Unauthenticated workspace/application endpoints returned HTTP 401.

The tests cover classification-schema rejection, confidence review routing, unrelated content handling, Persian/German text, CSV formula escaping, encryption context, oversized request bodies, custom IMAP host/address validation, multipart decoding, pagination failures, duplicate receipts, reply ordering, persistent user edits, partial-page retries, import boundaries, live/history alternation, ownership, pause races, shared budgets, and per-user fairness.

They use synthetic fixtures and an in-memory Firestore transaction double. They do not establish real database isolation or live model accuracy.

## Configured service checks

The twelve-case opt-in Groq evaluation passed with the configured hosted model. This is a small synthetic sample, not a general accuracy guarantee. The live evaluation explicitly loads local Groq and AI settings with Vite, including when Vitest runs in test mode.

Firebase was configured on the Spark plan with Email/Password and Google sign-in, a registered web client, and a Standard Firestore database in Europe. Server access to Auth and Firestore passed. The scheduled-sync composite index was created and its query passed on the actual database. The database starts with production rules denying direct client reads and writes.

A real Google sign-in opened the live workspace. A custom-domain mailbox connected over verified TLS IMAP on port 993. Its initial new-mail-only sync completed, saved its live cursor, and reported no error. Stored credentials were checked to be encrypted. No historical messages were imported; classification of an actual newly received job response remains to be observed. Groq Global Zero Data Retention was enabled in the console before connecting the mailbox.

## Browser review

The production-built application was reviewed through the browser at a 1440×1000 desktop viewport and 390×844 phone viewport. Compact landing navigation was also checked at 375px and 320px widths.

Observed working interactions:

- Search in English and Persian.
- Open application details, save a note, close/reopen, and confirm it remains.
- Correct an application status and see the manual override notice.
- Archive an application, find it in Archive, and restore it.
- Switch dark/light mode and reload to confirm persistence.
- Use list and board views.
- Open the mobile navigation drawer and navigate to Settings.
- Confirm closed mobile navigation is excluded from the accessible page and the open menu is a modal dialog.
- Confirm the phone workspace does not create whole-page horizontal overflow. The board itself scrolls horizontally by design.

Screenshots are in `docs/images/`. Their inboxes, companies, and messages are illustrative sample content for documentation only.

## Still needs a configured staging deployment

- Email/password sign-up, verification email, reset email, and revoked-token behavior.
- Real Google/Microsoft consent and token refresh.
- IMAP UID transitions and a newly received job response. IMAP currently checks Inbox only.
- Concurrent transaction behavior on the actual Firestore service.
- Netlify background dispatch, scheduled execution with the browser closed, and hosting-plan limits.
- A broader set of representative multilingual classification examples.
- Real account export/deletion and any operator backup/retention process.

Service credentials are kept in the ignored local environment file and are excluded from the source archive and Git history. A public Netlify deployment and unattended scheduled execution have not yet been verified. No email was sent by Replylane.
