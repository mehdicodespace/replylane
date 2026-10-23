import type { Config } from "@netlify/functions";
import { timingSafeEqual } from "node:crypto";
import { scheduledSync } from "../../src/lib/server/sync";
import { drainTelegramOutbox } from "../../src/lib/server/telegram";

export default async (request: Request) => {
  const secret = process.env.CRON_SECRET;
  const actual = request.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;
  if (
    !secret ||
    actual.length !== expected.length ||
    !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  )
    return;
  try {
    const result =
      process.env.MAIL_PROCESSING_ENABLED === "true"
        ? await scheduledSync(36)
        : { processed: 0, checked: 0, failed: 0 };
    const telegram = await drainTelegramOutbox(30);
    console.info("Background processing finished.", {
      inboxMessagesProcessed: result.processed,
      inboxConnectionsChecked: result.checked,
      inboxConnectionsFailed: result.failed,
      telegramOutboxDue: telegram.pending,
      telegramDeliveriesAttempted: telegram.attempted,
      telegramNotificationsSent: telegram.sent,
      telegramDeliveryFailures: telegram.failed,
    });
  } catch (error) {
    console.error("Background mail sync paused; queued work is retained.", {
      type: error instanceof Error ? error.name : "UnknownError",
    });
  }
};
export const config: Config = { background: true };
