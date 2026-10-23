import { NextResponse } from "next/server";
import { z } from "zod";
import {
  authenticate,
  db,
  requireProcessing,
  rateLimit,
  jsonBody,
  responseError,
} from "@/lib/server/core";
import { syncConnection } from "@/lib/server/sync";
import { drainTelegramOutbox } from "@/lib/server/telegram";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const uid = await authenticate(request);
    requireProcessing();
    await rateLimit(uid, "sync", 2);
    const { id, force } = z
      .object({ id: z.string().regex(/^[a-f0-9]{64}$/), force: z.boolean().optional() })
      .parse(await jsonBody(request));
    let result = await syncConnection(id, uid, force === true);
    let processed = result.processed;
    // A manual check may safely drain a few more mailbox pages when they need no
    // inference. Stop as soon as shared provider pacing is active so the button
    // never waits through a quota window.
    for (let page = 1; force === true && result.hasMore && page < 5; page++) {
      const throttle = await db().collection("system").doc("aiThrottle").get();
      if ((throttle.data()?.until || 0) > Date.now()) break;
      result = await syncConnection(id, uid, true);
      processed += result.processed;
    }
    let telegramNotificationsSent = 0;
    try {
      telegramNotificationsSent = (await drainTelegramOutbox(10)).sent;
    } catch {
      console.error("Telegram notifications could not be drained after a manual inbox check.");
    }
    return NextResponse.json({ ...result, processed, telegramNotificationsSent });
  } catch (error) {
    return responseError(error);
  }
}
