import type { Config } from "@netlify/functions";
import { scheduledSync } from "../../src/lib/server/sync";

export default async () => {
  try { await scheduledSync(); }
  catch { console.error("Scheduled mail sync could not finish; queued work is retained."); }
};
export const config:Config={schedule:"*/15 * * * *"};
