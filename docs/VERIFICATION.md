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

## Browser review

The production-built application was reviewed through the browser at a 1440×1000 desktop viewport and 390×844 phone viewport. Compact landing navigation was also checked at 375px and 320px widths.

Observed working interactions:

- Search in English and Persian.
- Open application details, save a note, close/reopen, and confirm it remains.
- Correct an application status and see the manual override notice.
- Archive an application, find it in Archive, and restore it.
- Switch dark/light mode and reload to confirm persistence.
- Use list and board views.
- Open the mobile navigation drawer, navigate to Settings, and reset the demo.
- Confirm closed mobile navigation is excluded from the accessible page and the open menu is a modal dialog.
- Confirm the phone workspace does not create whole-page horizontal overflow. The board itself scrolls horizontally by design.

Screenshots are in `docs/images/`. Their inboxes, companies, and messages are illustrative demo data.

## Still needs a configured staging deployment

- Real Firebase sign-up, verification email, reset email, and revoked-token behavior.
- Real Google/Microsoft consent and token refresh.
- Your hosting provider’s IMAP login, TLS behavior, folder coverage, and UID transitions.
- Firestore rules/index deployment and concurrent transaction behavior on the actual service.
- Netlify background dispatch, scheduled execution with the browser closed, and hosting-plan limits.
- The opt-in twelve-case live Groq evaluation and a broader set of representative multilingual examples.
- Real account export/deletion and any operator backup/retention process.

No production mailbox, AI key, Firebase service account, GitHub remote, or Netlify account was supplied during this build. No real email was read or sent, and no live deployment or model-accuracy result is claimed.
