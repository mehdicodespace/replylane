# Choosing the classifier

Checked October 21, 2026. Limits change, and the account console is the final source for a particular project.

The model has two jobs: decide whether a message is an actual application response, then extract its outcome without confusing politeness with acceptance. Persian, English, and German support matters more than creative writing. Predictable JSON, reasonable data handling, and sustainable quota matter alongside model size.

## Provider comparison

| Provider             | Relevant findings                                                                                                                                                                                                                                       | Decision                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Groq                 | Its published free table lists GPT-OSS 120B at 30 RPM, 1,000 requests/day, 8,000 tokens/minute, and 200,000 tokens/day. Strict structured output is supported. Organization-level quotas are shared. Zero Data Retention is available to all customers. | Default for a small controlled pilot; validate actual account limits and multilingual results.                    |
| Gemini Developer API | There are model-dependent free allowances, but unpaid-service terms allow submitted content to improve products and instruct users not to submit sensitive, confidential, or personal information. Region and audience conditions also apply.           | Not the default for personal inbox content on an unpaid project. Revisit a suitable paid configuration if needed. |
| Cerebras             | The current documentation lists 1M tokens/day for its Free Trial, but that is a $5, 30-day trial after adding a verified payment method. It explicitly says there is no permanently renewing free tier.                                                 | A possible paid alternative; not a sustainable free-tier answer.                                                  |

Sources: [Groq limits](https://console.groq.com/docs/rate-limits), [Groq structured output](https://console.groq.com/docs/structured-outputs), [Groq data controls](https://console.groq.com/docs/your-data), [Gemini API terms](https://ai.google.dev/gemini-api/terms), [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [Cerebras limits and trial FAQ](https://inference-docs.cerebras.ai/support/rate-limits).

The model recommendation is based on the API contract, quota, and data controls. No live comparative benchmark was performed without service keys. The twelve synthetic cases under `evaluation/` make that next step reproducible. Persian hiring emails, mixed-language signatures, quoted threads, and ambiguous decisions should receive particular attention in a pilot.

## What “generous” means in this app

Quota is shared by all users. A second API key in the same organization does not give the product a second organization’s allowance. This implementation does not rotate identities or keys to get around limits.

For a rough planning example, if a complete classification uses 1,000 total tokens, a 200,000-token daily allowance permits about 200 classifications before request/minute limits and overhead. At 2,000 tokens, it is about 100. These are estimates, not measured costs or supported-user promises. Persian tokenization, reasoning, long messages, and output length can change the total considerably.

The shipped application cap is 150,000 tokens/day to leave headroom below that published example. A mailbox receiving many unrelated messages can consume the allowance even if only a few are application responses. Starting with **New emails only** is the best default for a low-cost personal test. A 30/60-day import is a queue, not a single giant prompt.

## Token controls already implemented

- Persist a receipt after each successful relevance/classification decision.
- Reuse receipts across overlapping sync windows and retries.
- Send at most 3,600 UTF-8 bytes of body text, bounded subject/sender details, and no attachments.
- Redact recognizable addresses and URLs before submission; do not claim complete anonymization.
- Get all fields in one structured response instead of separate relevance, translation, extraction, and status calls.
- Keep the system instructions stable so provider-side prompt caching can help when available; no caching discount is assumed in the budget.
- Reserve conservatively before a call, then reconcile verified usage on a successful metered response.
- Apply one shared deployment budget, an organization-wide throttle, and a separate per-user limit.
- Respect upstream 429 responses and keep the message queued. Do not retry in a rapid loop.
- Never send a whole inbox, an attachment, or an HTML document as one prompt.

No English-only keyword gate is used before the classifier. Such a gate would be cheaper but could silently miss a short Persian rejection or a German hiring update. A carefully evaluated, user-visible “focused scan” mode may be worthwhile later; it should not be presented as perfect recall.

## Reliability and interpretation

The response schema restricts output shape, not truth. Zod checks the result again. Confidence below 0.82, or relevance confidence below 0.85, sends a retained result to review. An uncertain “irrelevant” decision is retained for human review rather than discarded. These are starting thresholds, not statistically calibrated probabilities.

The prompt distinguishes application receipt, interview, assessment, explicit offer, rejection, and ambiguous update. It treats message text as untrusted data. The model has no tools, cannot open links, and cannot send mail. Model instructions alone are not the security boundary; the server only accepts validated classification fields.

There is no promise of 100% recall. A confident wrong relevance decision can still exclude a message. Review model errors against representative fixtures before public use and keep the original inbox as the source of record.

## Scaling past the pilot

A free tier can validate the idea and support personal use. Broad adoption needs measured per-user mail volume, queue age monitoring, retention limits, a dedicated queue, and a funded allowance or approved provider capacity. An optional daily digest or notification should summarize stored results without another AI pass.

Larger allowances should be adopted through a legitimate plan change or a separately configured provider that users are told about. Automatic undisclosed provider fallback would change where private email is sent, so it is intentionally absent.
