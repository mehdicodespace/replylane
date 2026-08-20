import type { Config } from "@netlify/functions";
import { timingSafeEqual } from "node:crypto";
import { scheduledSync } from "../../src/lib/server/sync";

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
    await scheduledSync(36);
  } catch {
    console.error("Background mail sync paused; queued work is retained.");
  }
};
export const config: Config = { background: true };
