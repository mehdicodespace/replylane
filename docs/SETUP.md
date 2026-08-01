# Running Replylane with real mail

The public demo works without this setup. Real inbox processing needs Firebase, an AI key, and either OAuth credentials or IMAP access. Configure one provider first, test it end to end, then add the others.

## 1. Local environment

Use Node.js 22.21+ and install the locked dependencies:

```sh
npm ci
```

Copy `.env.example` to `.env.local`. Keep `MAIL_PROCESSING_ENABLED=false` while setting up the services. The app never needs an AI model installed locally.

The `.npmrc` file preserves the dependency installation setting used to generate the lockfile. The `@grpc/grpc-js` override selects a patched version compatible with the Firebase dependency chain.

## 2. Firebase

Create a Firebase project in the [Firebase console](https://console.firebase.google.com/). Add a Web app and copy its web configuration into:

```text
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_APP_ID
```

Under Authentication, enable **Email/Password** and **Google** sign-in. Add `localhost` and your final Netlify/custom domain to Authorized domains. Review the email verification and password reset templates. A newly created email/password account must verify its email before connecting a mailbox.

Create a Firestore database. Choose its region deliberately before creation. From Project settings → Service accounts, create a server credential and set:

```text
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
```

`FIREBASE_PRIVATE_KEY` supports literal `\n` escapes or real newlines. Never commit the service-account JSON. Give the deployed service account the access required for Firestore and Firebase Authentication user verification/deletion; do not use a broadly privileged owner credential as a long-term shortcut.

Deploy the checked-in rules and index using the Firebase CLI authenticated to your project:

```sh
npx firebase-tools deploy --only firestore:rules,firestore:indexes --project YOUR_PROJECT_ID
```

The rules deny **all direct browser access**. That is intentional: the app reads through authenticated server routes. The Admin SDK bypasses rules, so its ownership checks matter. Wait for the `connections(status, nextSyncAt)` index to finish building before enabling the scheduler.

Create two independent random values:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Use one as `TOKEN_ENCRYPTION_KEY` and another as `CRON_SECRET`. The encryption key must decode to exactly 32 bytes. Back it up in a secret manager. Changing it makes existing encrypted mailbox credentials unreadable; users will need to reconnect. The cron secret protects the background worker dispatch.

## 3. Groq

Create an API key in the [Groq console](https://console.groq.com/keys). Set:

```text
GROQ_API_KEY=your-server-key
GROQ_MODEL=openai/gpt-oss-120b
AI_DAILY_REQUEST_BUDGET=500
AI_DAILY_TOKEN_BUDGET=150000
AI_MIN_INTERVAL_MS=8000
```

Check the actual organization limits in your console; the example values are application caps, not a provider entitlement. Enable **Zero Data Retention** in Groq’s Data Controls and review their terms/data-processing arrangements before using private email. The app uses synchronous inference, not batches or fine-tuning. Confirm that your account and intended audience can use the service in their locations.

The per-user request limit is currently 30 classifications per UTC day. It includes relevant and irrelevant messages and failed attempts. Failed requests retain their token reservation. A successful metered response releases unused tokens. Global and personal counters reset by using a new UTC-day document; the application does not reset the provider’s quota.

Run the opt-in synthetic evaluation when ready:

```sh
npm run evaluate:ai
```

The evaluation uses the same prompt and request builder as production. It calls Groq directly and reports usage, so run it while the production worker is quiet. It does not use the production Firestore reservation counters. A passing synthetic evaluation is a starting point; test carefully with examples representative of your own applications before broad use.

## 4. Your custom-domain mailbox

For an address such as `work@your-domain.com`, no Google or Microsoft mail client secret is needed if its mail host supports IMAP.

Find these details in your hosting panel or ask the provider:

- IMAP server hostname. Do not assume it matches your domain.
- Username, usually the full email address.
- An app-specific password, or a dedicated mailbox credential if the provider does not offer app passwords.
- IMAP over TLS on port 993 with a valid public certificate.

Sign in to Replylane → Connected inboxes → Connect an inbox → **Other / custom domain (IMAP)**. Enter the exact host. Start with **New emails only** for the cheapest test. Send the mailbox a synthetic application response after connection, then use Sync or wait for the scheduler.

Only the Inbox folder is supported in this version. Mail automatically moved to another folder by your own rules will not be found through IMAP. SMTP is for sending and is not used. Arbitrary ports, private IP addresses, and self-signed TLS certificates are not accepted. DNS answers are validated and pinned for the connection.

Yahoo, iCloud, and Fastmail presets use the same IMAP flow with their known hostnames. Their account settings must permit IMAP/app passwords.

## 5. Gmail OAuth, if needed

In [Google Cloud Console](https://console.cloud.google.com/), enable Gmail API and configure the OAuth consent screen. For a private test, add your account as a test user.

Create a **Web application** OAuth client with this exact callback:

```text
http://localhost:3000/api/mail/callback
https://YOUR-SITE.netlify.app/api/mail/callback
```

Add only the URLs you use. Configure the consent-screen domains and the relevant JavaScript origin for Firebase Google sign-in separately. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` on the server. The mailbox permission is `https://www.googleapis.com/auth/gmail.readonly`.

Firebase Google sign-in and Gmail mailbox OAuth serve different purposes, even if you use the same Google Cloud project. Signing into Replylane does not by itself authorize Gmail reading.

Gmail readonly is a **restricted** scope. A public app that stores or transmits restricted-scope data needs the applicable verification/security-assessment process. Testing-mode refresh-token expiry can also require reconnecting periodically. Review Google’s [scope documentation](https://developers.google.com/workspace/gmail/api/auth/scopes) and [restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification) before inviting the public.

## 6. Outlook / Microsoft 365 OAuth, if needed

Register an app in [Microsoft Entra](https://entra.microsoft.com/) that supports the account types you intend to accept. For both consumer Outlook and workplace accounts, select the appropriate multitenant + personal Microsoft account option.

Add a **Web** redirect URI matching `/api/mail/callback` on localhost and production. Create a client secret and set `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET`. Add delegated permissions:

```text
Mail.Read
User.Read
offline_access
```

Do not use application-wide Mail.Read or Mail.ReadWrite for this app. Organizational tenants can require administrator approval even for delegated consent. Token rotation is saved when Microsoft returns a replacement refresh token.

## 7. Enable and test locally

Set `APP_URL=http://localhost:3000` and `MAIL_PROCESSING_ENABLED=true`. Restart `npm run dev` after environment changes. Create/verify your account and connect one mailbox. Choose an import range explicitly.

The ordinary Next.js development server does not run Netlify schedules. The Sync button processes a bounded mailbox pass. A page contains up to three messages, and each pass classifies at most one unrecorded message. Repeat within the throttle interval to advance through test messages. Rate-limit responses are expected if you click repeatedly too quickly.

Test at least:

1. New emails only excludes a message received before connection.
2. English, Persian, and German replies show the right application and status.
3. A normal receipt or newsletter is excluded.
4. A second sync does not make a duplicate or spend tokens on the same recorded message.
5. Notes and a manual correction survive a subsequent reply.
6. Pausing/disconnecting prevents new results from being saved.
7. A second user cannot access the first user’s records.
8. Export and account deletion work in a disposable staging account.

## 8. Netlify

Push the Git repository to your own GitHub repository, then import it in [Netlify](https://app.netlify.com/). There is no GitHub remote or Netlify deployment pre-created by this project.

The checked-in `netlify.toml` uses:

```text
Build command: npm run build
Publish directory: .next
Node version: 22
Functions directory: netlify/functions
```

Use Netlify’s current Next.js adapter. Do not configure a static export: this app has authenticated server routes. Add the `NEXT_PUBLIC_*` Firebase values to the build environment and keep the other values server-only. Set the final `APP_URL`, OAuth callbacks, and Firebase authorized domain to the actual deployed URL.

Keep live processing disabled in untrusted deploy previews. Do not expose production service-account keys or mailbox secrets to fork builds. Changes to browser variables need a rebuild.

In production, `sync-mail` runs every 15 minutes and invokes the protected `sync-mail-background` function. That worker processes up to twelve new classifications per invocation, with a four-minute work window, pacing, and mailbox leases. The provider allowance may stop it sooner. Confirm background/scheduled function availability and hosting credit costs on your Netlify plan. The worker logs a generic failure if dispatch or processing cannot finish; inspect connection status and deployment logs if it stops progressing.

After deployment, test the real callback and verify a scheduled sync while the browser is closed. A successful local build does not verify those external integrations.

## Before accepting public registrations

Supply the operator’s identity and privacy contact in `/privacy` and `/terms`, establish retention and account-deletion handling with your infrastructure providers, complete applicable OAuth verification, and review the app with representative real-world fixtures. Keep the public demo available even if live registration is limited during this pilot.
