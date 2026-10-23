import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Transaction } from "firebase-admin/firestore";
import { AppError, appURL, db, env, hash, userRef } from "./core";
import type { Status } from "../domain";

const telegramApi = (method: string) =>
  `https://api.telegram.org/bot${env("TELEGRAM_BOT_TOKEN")}/${method}`;

function assertConfigured() {
  const username = env("TELEGRAM_BOT_USERNAME").replace(/^@/, "");
  if (!/^[A-Za-z0-9_]{5,32}$/.test(username))
    throw new AppError("The Telegram bot username is not configured correctly.", 503);
  const secret = env("TELEGRAM_WEBHOOK_SECRET");
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret))
    throw new AppError("The Telegram webhook secret is not configured correctly.", 503);
  return { username, secret };
}

export function telegramConfigured() {
  return Boolean(
    process.env.TELEGRAM_BOT_TOKEN &&
    process.env.TELEGRAM_BOT_USERNAME &&
    process.env.TELEGRAM_WEBHOOK_SECRET,
  );
}

export function telegramLocalPollingEnabled() {
  try {
    const host = new URL(appURL()).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  } catch {
    return false;
  }
}

export async function ensureTelegramWebhook() {
  const { secret } = assertConfigured();
  const url = appURL();
  if (!url.startsWith("https://"))
    throw new AppError(
      "Telegram linking needs a public HTTPS app URL. Configure APP_URL for your deployed site.",
      503,
    );
  const webhook = await fetch(telegramApi("setWebhook"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: `${url}/api/telegram/webhook`,
      secret_token: secret,
      allowed_updates: ["message"],
    }),
    signal: AbortSignal.timeout(10000),
  });
  const result = (await webhook.json().catch(() => null)) as { ok?: boolean } | null;
  if (!webhook.ok || !result?.ok)
    throw new AppError(
      "The Telegram bot couldn’t be prepared. Check its server configuration and try again.",
      502,
    );
}

export async function createTelegramLink(uid: string) {
  const { username } = assertConfigured();
  if (telegramLocalPollingEnabled()) {
    // Telegram cannot reach localhost. Long polling is the development-only equivalent.
    const response = await fetch(telegramApi("deleteWebhook"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drop_pending_updates: false }),
      signal: AbortSignal.timeout(10000),
    });
    const result = (await response.json().catch(() => null)) as { ok?: boolean } | null;
    if (!response.ok || !result?.ok)
      throw new AppError("The Telegram bot couldn’t be prepared for local testing.", 502);
  } else {
    await ensureTelegramWebhook();
  }

  const token = randomBytes(32).toString("base64url");
  await db()
    .collection("telegramLinkTokens")
    .doc(hash(token))
    .set({ uid, expiresAt: Date.now() + 10 * 60 * 1000, createdAt: Date.now() });
  return { url: `https://t.me/${username}?start=${token}` };
}

export async function pollTelegramUpdates() {
  if (!telegramLocalPollingEnabled() || !telegramConfigured())
    throw new AppError("Local Telegram polling is only available in local development.", 403);

  const ref = db().collection("system").doc("telegramLocalPoller");
  const lock = randomBytes(12).toString("hex");
  const offset = await db().runTransaction(async (tx) => {
    const state = await tx.get(ref);
    if ((state.data()?.lockUntil || 0) > Date.now()) return null;
    const nextOffset = Number(state.data()?.offset || 0);
    tx.set(ref, { lock, lockUntil: Date.now() + 15000, offset: nextOffset }, { merge: true });
    return nextOffset;
  });
  if (offset === null) return { busy: true };

  try {
    const response = await fetch(telegramApi("getUpdates"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offset, timeout: 0, allowed_updates: ["message"] }),
      signal: AbortSignal.timeout(8000),
    });
    const result = (await response.json().catch(() => null)) as {
      ok?: boolean;
      result?: Array<Record<string, unknown>>;
    } | null;
    if (!response.ok || !result?.ok || !Array.isArray(result.result))
      throw new AppError("Telegram could not be checked right now. Try again shortly.", 502);

    let nextOffset = offset;
    for (const update of result.result) {
      await handleTelegramUpdate(update);
      const id = Number(update.update_id);
      if (Number.isSafeInteger(id)) nextOffset = Math.max(nextOffset, id + 1);
    }
    await db().runTransaction(async (tx) => {
      const state = await tx.get(ref);
      if (state.data()?.lock === lock)
        tx.set(ref, { offset: nextOffset, lock: "", lockUntil: 0 }, { merge: true });
    });
    return { received: result.result.length };
  } catch (error) {
    await db().runTransaction(async (tx) => {
      const state = await tx.get(ref);
      if (state.data()?.lock === lock) tx.set(ref, { lock: "", lockUntil: 0 }, { merge: true });
    });
    throw error;
  }
}

export function validateTelegramSecret(actual: string | null) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (
    !expected ||
    !actual ||
    !/^[A-Za-z0-9_-]{1,256}$/.test(expected) ||
    actual.length !== expected.length
  )
    return false;
  return timingSafeEqual(Buffer.from(actual, "ascii"), Buffer.from(expected, "ascii"));
}

async function sendMessage(chatId: string | number, text: string) {
  const response = await fetch(telegramApi("sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(8000),
  });
  const result = (await response.json().catch(() => null)) as { ok?: boolean } | null;
  if (!response.ok || !result?.ok) throw new Error("Telegram delivery failed");
}

export async function handleTelegramUpdate(update: Record<string, unknown>) {
  const message = update.message as
    | { text?: string; chat?: { id?: number; type?: string }; from?: { username?: string } }
    | undefined;
  const chatId = message?.chat?.id;
  const text = message?.text?.trim();
  if (!chatId || message?.chat?.type !== "private" || !text) return;

  const start = text.match(/^\/start(?:@[A-Za-z0-9_]+)?\s+([A-Za-z0-9_-]{20,64})$/);
  if (start) {
    const tokenRef = db().collection("telegramLinkTokens").doc(hash(start[1]));
    const chatRef = db()
      .collection("telegramChatLinks")
      .doc(hash(String(chatId)));
    const result = await db().runTransaction(async (tx) => {
      const tokenSnap = await tx.get(tokenRef);
      if (!tokenSnap.exists || tokenSnap.data()?.expiresAt < Date.now()) return "expired" as const;
      const uid = tokenSnap.data()?.uid as string;
      const ownerRef = userRef(uid);
      const [owner, chatLink] = await Promise.all([tx.get(ownerRef), tx.get(chatRef)]);
      if (!owner.exists || owner.data()?.deleting) return "expired" as const;
      if (chatLink.exists && chatLink.data()?.uid !== uid) return "in-use" as const;
      const oldChatId = owner.data()?.telegram?.chatId;
      if (oldChatId && String(oldChatId) !== String(chatId))
        tx.delete(
          db()
            .collection("telegramChatLinks")
            .doc(hash(String(oldChatId))),
        );
      tx.set(
        ownerRef,
        {
          telegram: {
            chatId: String(chatId),
            username: message.from?.username || null,
            linkedAt: Date.now(),
          },
        },
        { merge: true },
      );
      tx.set(chatRef, { uid, linkedAt: Date.now() });
      tx.delete(tokenRef);
      return "linked" as const;
    });
    await sendMessage(
      chatId,
      result === "linked"
        ? "Replylane is connected. You’ll get a private message when a new job reply is classified. Use /stop to disconnect."
        : result === "in-use"
          ? "This Telegram account is already linked to another Replylane account. Disconnect it there first."
          : "This connection link has expired. Create a fresh link in Replylane Settings.",
    );
    return;
  }

  if (/^\/(?:stop|unlink)(?:@[A-Za-z0-9_]+)?$/.test(text)) {
    const chatRef = db()
      .collection("telegramChatLinks")
      .doc(hash(String(chatId)));
    const unlinked = await db().runTransaction(async (tx) => {
      const link = await tx.get(chatRef);
      if (!link.exists) return false;
      const ownerRef = userRef(link.data()?.uid as string);
      const owner = await tx.get(ownerRef);
      if (String(owner.data()?.telegram?.chatId || "") === String(chatId))
        tx.update(ownerRef, { telegram: null });
      tx.delete(chatRef);
      return true;
    });
    await sendMessage(
      chatId,
      unlinked
        ? "Replylane notifications are disconnected."
        : "This chat isn’t connected to Replylane.",
    );
  }
}

export function queueTelegramNotification(
  tx: Transaction,
  uid: string,
  mailKey: string,
  notification: {
    company: string;
    role: string;
    status: Status;
    summary: string;
    receivedAt: string;
  },
) {
  if (notification.status === "received") return;
  tx.create(
    db()
      .collection("telegramOutbox")
      .doc(hash(`${uid}:${mailKey}`)),
    {
      uid,
      ...notification,
      attempts: 0,
      nextAttemptAt: Date.now(),
      createdAt: Date.now(),
    },
  );
}

export function formatTelegramNotification(data: {
  company?: unknown;
  role?: unknown;
  status?: unknown;
  summary?: unknown;
}) {
  const status = data.status as Status;
  const labels: Record<Status, string> = {
    received: "🔵 APPLICATION RECEIVED",
    interview: "🟣 MOVING FORWARD · INTERVIEW",
    next_step: "🟣 MOVING FORWARD · NEXT STEP",
    offer: "🟢 OFFER RECEIVED",
    rejected: "🔴 REJECTION",
    review: "🟡 NEEDS A QUICK REVIEW",
  };
  const heading = labels[status] || "🟡 NEW JOB REPLY";
  const company = String(data.company || "Unknown company");
  const role = String(data.role || "");
  const summary = String(data.summary || "A new reply was added to your applications.").slice(
    0,
    1200,
  );

  return [
    heading,
    "━━━━━━━━━━━━━━━━",
    `🏢 ${company}`,
    role ? `💼 ${role}` : "",
    "",
    "📝 WHAT IT SAYS",
    summary,
    "",
    `↗ Open your applications: ${appURL()}/app/applications`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function drainTelegramOutbox(limit = 20) {
  if (!telegramConfigured()) return { sent: 0, failed: 0, pending: 0, attempted: 0 };
  const due = await db()
    .collection("telegramOutbox")
    .where("nextAttemptAt", "<=", Date.now())
    .orderBy("nextAttemptAt", "asc")
    .limit(limit)
    .get();
  let sent = 0;
  let failed = 0;
  let attempted = 0;
  for (const item of due.docs) {
    const uid = item.data().uid as string;
    const lock = randomBytes(12).toString("hex");
    const claimed = await db().runTransaction(async (tx) => {
      const [current, owner] = await Promise.all([tx.get(item.ref), tx.get(userRef(uid))]);
      if (!current.exists || (current.data()?.lockUntil || 0) > Date.now()) return null;
      const chatId = owner.data()?.telegram?.chatId as string | undefined;
      // Drop receipts queued before receipt notifications were disabled, too.
      if (
        current.data()?.status === "received" ||
        !owner.exists ||
        owner.data()?.deleting ||
        !chatId
      ) {
        tx.delete(item.ref);
        return null;
      }
      tx.update(item.ref, { lock, lockUntil: Date.now() + 30000 });
      return { data: current.data()!, chatId };
    });
    if (!claimed) continue;
    attempted++;
    const data = claimed.data;
    const body = formatTelegramNotification(data);
    try {
      await sendMessage(claimed.chatId, body);
      await item.ref.delete();
      sent++;
    } catch {
      failed++;
      const attempts = Number(data.attempts || 0) + 1;
      if (attempts >= 8) {
        await item.ref.delete();
      } else {
        await item.ref.update({
          attempts,
          lock: "",
          lockUntil: 0,
          nextAttemptAt: Date.now() + Math.min(6 * 3600000, 30000 * 2 ** attempts),
        });
      }
    }
  }
  return { sent, failed, pending: due.size, attempted };
}
