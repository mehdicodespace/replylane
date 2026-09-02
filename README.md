# Replylane

A calmer place for job application replies.

When you apply to several roles, the replies tend to disappear between newsletters, receipts, and everything else in your inbox. Replylane pulls application responses into a small workspace: received, interviews and next steps, offers, rejections, and messages that need another look.

It is built for applications across countries. A Persian reply stays readable in Persian; the summary and suggested next step are in English.

![Replylane application workspace with illustrative sample data](docs/images/workspace-light.jpg)

[Landing page preview](docs/images/landing-light.jpg) · [Mobile dark theme](docs/images/mobile-dark.jpg)

## Try it locally

Requires Node.js 22.21 or later and npm.

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000), create an account, and verify your email address. Sign in to access your private workspace. Workspace routes require an authenticated account; the public site has no demo workspace.

## What is here

- A landing page, sign-up and sign-in, email verification, and password reset.
- A responsive workspace with board and list views, light and dark themes, and mobile navigation.
- Search by company, role, sender, or reply; filter by language, status, date, and mailbox.
- Original reply excerpts, English summaries, confidence estimates, next steps, and reply history.
- Saved applications, private notes, editable deadlines, manual status corrections, and archive/restore.
- Gmail and Outlook / Microsoft 365 OAuth connections.
- Encrypted IMAP connections for Yahoo, iCloud, Fastmail, and custom-domain mail.
- `.eml` import for an individual email from another provider.
- New mail only, or a bounded import of the last 30 or 60 days.
- Import older emails from an existing connection, with live counts, retry status, and date range visible in the app.
- A scheduled worker, durable checkpoints, duplicate receipts, retries, and shared AI budgets.
- Optional Telegram notifications for newly classified live replies, with a short summary and category.
- CSV export, connection pause/disconnect, and account deletion.

Interviews and assessments share the **Moving forward** board column, with distinct status badges. No original emails are moved, deleted, or sent.

## Connect a real inbox

The integration code is included, but live accounts require your service configuration. Follow [SETUP.md](docs/SETUP.md) for Firebase, Groq, mailbox providers, and Netlify. Keep secrets in environment variables. Start with your own account before opening registration to other people.

For a custom address such as `work@your-domain.com`, select **Other / custom domain (IMAP)**. Use the IMAP server supplied by your mail host, TLS port 993, and its app password. SMTP is not required. IMAP currently checks **Inbox**; it does not scan every custom folder.

Telegram notifications are optional. Create a bot with Telegram’s BotFather, then configure `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, and a random `TELEGRAM_WEBHOOK_SECRET` on the server. In local development, Replylane uses Telegram long polling while a signed-in user has the app open, so Telegram can complete the connection and deliver queued notices without a public tunnel. In production it registers a webhook at the deployed HTTPS `APP_URL`. Those two delivery methods are exclusive for one bot token: using the same bot locally removes its webhook until production registers it again. The user opens the one-time link and presses **Start** in a private chat. The bot sends new live reply categories and summaries; historical imports stay quiet. Never put the bot token in a `NEXT_PUBLIC_` variable or in source control.

If you started with new emails only, open **Connected inboxes → Import older emails** and choose 30 or 60 days. The inbox card shows progress while application cards appear as replies are found. The app continues queued work while it is open; Netlify's scheduled worker handles unattended imports once deployed. Imports respect the per-account and shared AI budgets, so a large mailbox may take more than one day.

## Why this stack

| Tool                            | Its job                                                                |
| ------------------------------- | ---------------------------------------------------------------------- |
| Next.js App Router + TypeScript | Pages, layouts, authenticated route handlers, server integrations      |
| TanStack Query                  | Fetching, caching, refreshing, and updating account data               |
| Zustand                         | Theme and preferred board/list view                                    |
| MUI + Emotion                   | Accessible dialogs, drawers, form controls, and theme-aware UI         |
| React Hook Form + Zod           | Account forms and input validation at server boundaries                |
| Firebase Auth + Firestore       | Accounts, private records, sync leases, and usage reservations         |
| Groq REST API                   | Hosted multilingual classification with structured JSON output         |
| ImapFlow + MailParser           | Read-only IMAP fetching and MIME decoding                              |
| Netlify Functions               | Periodic dispatch and bounded background processing                    |
| Vitest                          | Processing, provider contracts, filtering, encryption, and quota tests |

Redux is intentionally absent. There is no second global state problem for it to solve here. Server data stays in TanStack Query; UI preferences stay in Zustand.

## AI usage

The default model is `openai/gpt-oss-120b` on Groq. A model name can be changed through `GROQ_MODEL`, but check API compatibility and run the evaluation first. [AI-RESEARCH.md](docs/AI-RESEARCH.md) records the provider comparison and the limits checked on October 21, 2026.

Each email is classified once after a successful receipt is recorded. Inputs are shortened, addresses and URLs are redacted where recognized, attachments are omitted, and one request returns relevance, status, entities, summary, and next action. No local model is required.

The deployment reserves tokens before sending a request and reconciles successful responses to reported usage. Failed calls keep a conservative reservation. A shared daily budget, a per-account allowance of up to 300 batches, and provider pacing protect the service from bursts. Obvious one-time service messages and bulk digests are filtered before model use. Exceeding a limit pauses queued work; it does not rotate through keys.

The free allowance belongs to the provider organization, not each app user. This is suitable for a controlled pilot, not a promise of free operation at unlimited scale. Uncertain messages still need classification to identify relevant responses, including ordinary inbox traffic.

## Check the project

```sh
npm run typecheck
npm test
npm run build
```

`npm run check` runs all three. CI runs them without secrets.

To test the actual model, add `GROQ_API_KEY` to `.env.local` and run:

```sh
npm run evaluate:ai
```

This opt-in command sends twelve checked-in **synthetic** emails to Groq, including Persian, German, French, polite rejections, newsletters, and an instruction-in-email case. It reports results and token usage. It consumes provider allowance and is separate from the offline test suite. No live model evaluation was run during initial development because no API key was supplied.

## How syncing works

1. You sign in, verify your account email, and separately consent to connecting a mailbox.
2. The backend encrypts its refresh token or IMAP password and records the import boundary.
3. Netlify dispatches a worker every 15 minutes. Incoming and import cursors alternate while a backfill is active.
4. The worker skips recorded deliveries, classifies one new message per leased mailbox pass, and writes results transactionally.
5. Relevant replies update their conversation’s application card. Older imports cannot overwrite newer replies. Your notes, saved state, and manual status stay intact.
6. The workspace refreshes while open. Scheduled processing also continues when it is closed.

The cadence is periodic, not real time. Backlogs and provider limits can make a reply take longer than 15 minutes. See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for the storage and failure behavior.

## Current edges

The code has offline tests and a verified production build. Real OAuth consent, live IMAP servers, Firestore deployment, scheduled Netlify execution, and the model’s classification accuracy still need to be exercised with your own configuration. The integration tests use an in-memory transaction double; they are not a substitute for a Firebase staging run.

IMAP supports TLS on port 993 and Inbox only. Some providers do not offer IMAP or app passwords. Microsoft tenant policies may require administrator approval. A mailbox reconnection preserves its original import choice. Thread grouping follows the mail provider’s conversation identifiers; unrelated threads are not merged automatically.

Before a public launch, finish provider verification where applicable, replace project privacy/terms notices with the operator’s details, and run a small multilingual pilot. Gmail’s read-only scope is restricted, so public use has additional verification requirements.

## Next things worth building

The most useful next steps are calendar export for interviews, deadline reminders, an optional daily digest, per-folder IMAP selection, and user feedback for false positives. Provider push notifications and a dedicated job queue would be the next infrastructure step when periodic polling no longer fits the user count. These are ideas for the next version, not features represented as already working.

MIT licensed. Company names and messages shown in documentation screenshots are illustrative and do not imply an endorsement.
