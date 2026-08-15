import { randomUUID } from "node:crypto";
import { classify, classifyBatch, PROMPT_VERSION } from "./ai";
import { AppError, db, hash, userRef } from "./core";
import {
  accessToken,
  gmailPage,
  microsoftPage,
  imapPage,
  type ConnectionSecret,
} from "./providers";
import type { Classification, MailInput, Application } from "../domain";
import { knownServiceMail } from "./mail-rules";
import { sanitizeEmailHTML } from "./email-html";
import { cleanEmailText } from "../email-content";

export async function recordMail(
  uid: string,
  connectionId: string,
  mail: MailInput,
  result: Classification,
  phase?: "live" | "import",
) {
  const receipt = userRef(uid)
    .collection("receipts")
    .doc(hash(`${connectionId}:${mail.id}`));
  const appId = hash(`${connectionId}:${mail.threadId}`);
  const app = userRef(uid).collection("applications").doc(appId);
  const event = app.collection("events").doc(hash(mail.id));
  await db().runTransaction(async (tx) => {
    const [seen, current, owner, connection] = await Promise.all([
      tx.get(receipt),
      tx.get(app),
      tx.get(userRef(uid)),
      tx.get(db().collection("connections").doc(connectionId)),
    ]);
    // Prevent a concurrent disconnect/deletion from recreating data after cleanup.
    if (
      !owner.exists ||
      owner.data()?.deleting ||
      !connection.exists ||
      connection.data()?.status !== "connected"
    )
      throw new AppError("This connection is no longer active.", 409);
    if (seen.exists) return;
    tx.set(receipt, {
      connectionId,
      processedAt: new Date().toISOString(),
      relevant: result.relevant,
      promptVersion: PROMPT_VERSION,
    });
    if (phase) {
      const c = connection.data()!;
      tx.update(connection.ref, {
        processed: (c.processed || 0) + 1,
        ...(phase === "import"
          ? {
              importChecked: (c.importChecked || 0) + 1,
              importMatched: (c.importMatched || 0) + Number(result.relevant),
            }
          : {}),
      });
    }
    if (!result.relevant) return;
    const existing = current.data() as Application | undefined;
    const latest = !existing || mail.receivedAt >= existing.receivedAt;
    tx.set(event, {
      id: hash(mail.id),
      subject: mail.subject.slice(0, 500),
      summary: result.summary,
      status: result.status,
      receivedAt: mail.receivedAt,
      excerpt: mail.text.slice(0, 5000),
    });
    if (!latest) return;
    tx.set(app.collection("messages").doc("latest"), {
      receivedAt: mail.receivedAt,
      html: mail.html ? sanitizeEmailHTML(mail.html) : null,
      text: cleanEmailText(mail.text).slice(0, 30000),
    });
    const status = existing?.manualStatus ? existing.status : result.status;
    tx.set(app, {
      id: appId,
      company: result.company,
      role: result.role,
      subject: mail.subject.slice(0, 500),
      sender: mail.sender.slice(0, 300),
      senderEmail: mail.senderEmail.slice(0, 300),
      summary: result.summary,
      excerpt: mail.text.slice(0, 5000),
      status,
      aiStatus: result.status,
      manualStatus: existing?.manualStatus || false,
      confidence: result.confidence,
      language: result.language,
      receivedAt: mail.receivedAt,
      nextAction: result.nextAction,
      deadline: existing?.deadline || result.deadline,
      starred: existing?.starred || false,
      archived: existing?.archived || false,
      notes: existing?.notes || "",
      connectionId,
      provider: connection.data()?.provider,
      messageUrl: mail.messageUrl,
    });
  });
}

export async function syncConnection(id: string, expectedUID?: string) {
  const ref = db().collection("connections").doc(id);
  const lockId = randomUUID();
  const connection = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const c = snap.data() as ConnectionSecret | undefined;
    if (!c || (expectedUID && c.uid !== expectedUID)) throw new AppError("Mailbox not found.", 404);
    if (c.status !== "connected")
      throw new AppError("Resume or reconnect this mailbox before syncing.", 409);
    const owner = await tx.get(userRef(c.uid));
    if (!owner.exists || owner.data()?.deleting)
      throw new AppError("This account is unavailable.", 409);
    if (c.lockUntil > Date.now()) throw new AppError("This mailbox is already syncing.", 409);
    if (c.nextSyncAt > Date.now() && c.lastSyncAt)
      throw new AppError("Your next sync is queued. Please wait a moment.", 429);
    // Longer than the maximum provider/AI work in a single invocation.
    tx.update(ref, { lockUntil: Date.now() + 240000, lockId });
    return c;
  });
  let processed = 0;
  try {
    // Backfill must never block incoming replies. Alternate the two independent
    // cursors until the bounded import is complete, then spend every turn on live mail.
    const phase =
      connection.importComplete ||
      (connection.lastPhase === "import" && Date.now() - (connection.lastLiveCheckAt || 0) >= 30000)
        ? "live"
        : "import";
    const pageConnection: ConnectionSecret =
      phase === "live"
        ? { ...connection, since: connection.createdAt, cursor: connection.liveCursor || null }
        : { ...connection, until: connection.createdAt };
    let page;
    if (connection.provider === "google" || connection.provider === "microsoft") {
      const token = await accessToken(connection, id);
      if (token.rotated) await ref.update({ secret: token.rotated });
      page =
        connection.provider === "google"
          ? await gmailPage(pageConnection, token.access)
          : await microsoftPage(pageConnection, token.access);
    } else page = await imapPage(pageConnection, id);
    const candidates = page.messages.filter(
      (mail) =>
        mail.receivedAt >= pageConnection.since &&
        (!pageConnection.until || mail.receivedAt < pageConnection.until) &&
        mail.senderEmail.toLowerCase() !== connection.email.toLowerCase(),
    );
    const seen = await Promise.all(
      candidates.map((mail) =>
        userRef(connection.uid)
          .collection("receipts")
          .doc(hash(`${id}:${mail.id}`))
          .get(),
      ),
    );
    const pending: MailInput[] = [];
    const known: Array<{ mail: MailInput; classification: Classification }> = [];
    for (const [index, mail] of candidates.entries()) {
      if (seen[index].exists) continue;
      const serviceMail = knownServiceMail(mail);
      if (serviceMail) known.push({ mail, classification: serviceMail });
      else if (pending.length < 6) pending.push(mail);
    }
    if (known.length) {
      for (const { mail, classification } of known) {
        await recordMail(connection.uid, id, mail, classification, phase);
        processed++;
      }
    }
    if (pending.length) {
      const results =
        pending.length === 1
          ? [await classify(pending[0], connection.uid)]
          : await classifyBatch(pending, connection.uid);
      for (const [index, mail] of pending.entries()) {
        await recordMail(connection.uid, id, mail, results[index], phase);
        processed++;
      }
    }
    const receipts = await Promise.all(
      page.messages
        .filter(
          (m) =>
            m.receivedAt >= pageConnection.since &&
            (!pageConnection.until || m.receivedAt < pageConnection.until) &&
            m.senderEmail.toLowerCase() !== connection.email.toLowerCase(),
        )
        .map((m) =>
          userRef(connection.uid)
            .collection("receipts")
            .doc(hash(`${id}:${m.id}`))
            .get(),
        ),
    );
    const pageDone = receipts.every((r) => r.exists);
    await db().runTransaction(async (tx) => {
      const [current, throttle] = await Promise.all([
        tx.get(ref),
        tx.get(db().collection("system").doc("aiThrottle")),
      ]);
      if (!current.exists || current.data()?.lockId !== lockId) return;
      if (current.data()?.status !== "connected") {
        tx.update(ref, { lockUntil: 0, lockId: "" });
        return;
      }
      tx.update(ref, {
        ...(pageDone
          ? phase === "live"
            ? { liveCursor: page.cursor }
            : { cursor: page.cursor, importComplete: page.complete }
          : {}),
        ...(phase === "import" && pageDone && page.complete
          ? {
              historyDaysCompleted: Math.max(
                current.data()?.historyDaysCompleted || 0,
                current.data()?.importDays || 0,
              ),
            }
          : {}),
        lastPhase: phase,
        ...(phase === "live" ? { lastLiveCheckAt: Date.now() } : {}),
        lastSyncAt: new Date().toISOString(),
        error: null,
        failures: 0,
        nextSyncAt: Math.max(
          throttle.data()?.until || 0,
          Date.now() +
            (phase === "live" && connection.importComplete && pageDone && page.complete
              ? 15 * 60000
              : 1000),
        ),
        lockUntil: 0,
        lockId: "",
      });
    });
    return { processed, hasMore: !pageDone || !page.complete };
  } catch (error) {
    const known = error instanceof AppError;
    const failures = (connection.failures || 0) + 1;
    // Unparseable or failed inference is never silently discarded or relabeled.
    const delay =
      known && error.status === 429
        ? Math.max(1000, (error.retryAt || Date.now() + 60000) - Date.now())
        : Math.min(6 * 3600000, 60000 * 2 ** Math.min(failures, 8));
    await db().runTransaction(async (tx) => {
      const current = await tx.get(ref);
      if (!current.exists || current.data()?.lockId !== lockId) return;
      if (current.data()?.status !== "connected") {
        tx.update(ref, { lockUntil: 0, lockId: "" });
        return;
      }
      tx.update(ref, {
        lockUntil: 0,
        lockId: "",
        nextSyncAt: Date.now() + delay,
        failures,
        error: known
          ? error.message
          : "Sync couldn't finish. Your messages remain queued for retry.",
        ...(known && error.status === 401 ? { status: "error" } : {}),
      });
    });
    throw error;
  }
}

export async function scheduledSync(maxMessages = 1) {
  if (process.env.MAIL_PROCESSING_ENABLED !== "true") return { processed: 0 };
  // Earliest due mailbox first. The composite index is tracked in firestore.indexes.json.
  let processed = 0;
  const deadline = Date.now() + 4 * 60000;
  let rounds = 0;
  while (
    processed < maxMessages &&
    Date.now() < deadline &&
    rounds++ < Math.max(5, maxMessages * 4)
  ) {
    const due = await db()
      .collection("connections")
      .where("status", "==", "connected")
      .where("nextSyncAt", "<=", Date.now())
      .orderBy("nextSyncAt")
      .limit(5)
      .get();
    if (due.empty) break;
    let progress = false;
    for (const doc of due.docs) {
      if (doc.data().status !== "connected" || doc.data().provider === "import") continue;
      try {
        const result = await syncConnection(doc.id);
        processed += result.processed;
        progress = true;
      } catch (error) {
        if (error instanceof AppError && error.status === 429 && error.code !== "PERSONAL_BUDGET")
          return { processed };
      }
      if (processed >= maxMessages || Date.now() >= deadline) break;
    }
    if (!progress) break;
    if (processed < maxMessages)
      await new Promise((resolve) =>
        setTimeout(resolve, Number(process.env.AI_MIN_INTERVAL_MS || 8000)),
      );
  }
  return { processed };
}
