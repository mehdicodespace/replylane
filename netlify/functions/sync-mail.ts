import type { Config } from "@netlify/functions";
import { appURL, env } from "../../src/lib/server/core";

export default async () => {
  if (process.env.MAIL_PROCESSING_ENABLED !== "true" && !process.env.TELEGRAM_BOT_TOKEN) return;
  try {
    const response = await fetch(`${appURL()}/.netlify/functions/sync-mail-background`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env("CRON_SECRET")}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("Background dispatch failed");
    console.info("Scheduled inbox sync dispatched to the background worker.");
  } catch {
    console.error("Scheduled mail sync could not finish; queued work is retained.");
  }
};
export const config: Config = { schedule: "*/1 * * * *" };
