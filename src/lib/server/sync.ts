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
import { assessmentStageStatus } from "../domain";
import { knownServiceMail } from "./mail-rules";
import { sanitizeEmailHTML } from "./email-html";
import { cleanEmailText } from "../email-content";
import { queueTelegramNotification } from "./telegram";

export async function recordMail(
  uid: string,
  connectionId: string,
  mail: MailInput,
  result: Classification,
  phase?: "live" | "import",
) {
  const normalizedStatus = assessmentStageStatus(
    `${mail.subject}\n${mail.text}\n${result.summary}`,
    result.status,
  );
  const classification =
    normalizedStatus === result.status ? result : { ...result, status: normalizedStatus };
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
      relevant: classification.relevant,
      promptVersion: PROMPT_VERSION,
      ...(phase ? { phase, counted: false } : { counted: true }),
    });
    if (!classification.relevant) return;
    const existing = current.data() as Application | undefined;
    const latest = !existing || mail.receivedAt >= existing.receivedAt;
    tx.set(event, {
      id: hash(mail.id),
      subject: mail.subject.slice(0, 500),
      summary: classification.summary,
      status: classification.status,
      receivedAt: mail.receivedAt,
      excerpt: mail.text.slice(0, 5000),
    });
    if (!latest) return;
    tx.set(app.collection("messages").doc("latest"), {
      receivedAt: mail.receivedAt,
      html: mail.html ? sanitizeEmailHTML(mail.html) : null,
      text: cleanEmailText(mail.text).slice(0, 30000),
    });
    const status = existing?.manualStatus ? existing.status : classification.status;
    tx.set(app, {
      id: appId,
      company: classification.company,
      role: classification.role,
      subject: mail.subject.slice(0, 500),
      sender: mail.sender.slice(0, 300),
      senderEmail: mail.senderEmail.slice(0, 300),
      summary: classification.summary,
      excerpt: mail.text.slice(0, 5000),
      status,
      aiStatus: classification.status,
      manualStatus: existing?.manualStatus || false,
      confidence: classification.confidence,
      language: classification.language,
      receivedAt: mail.receivedAt,
      nextAction: classification.nextAction,
      deadline: existing?.deadline || classification.deadline,
      starred: existing?.starred || false,
      isRead: latest ? false : existing?.isRead || false,
      archived: existing?.archived || false,
      trashed: existing?.trashed || false,
      notes: existing?.notes || "",
      connectionId,
      provider: connection.data()?.provider,
      messageUrl: mail.messageUrl,
    });
    // A new message can be discovered while an older history import is in progress.
    // Notify for mail received after this mailbox was connected, regardless of which
    // cursor found it; older backfill remains quiet.
    const connectedAt = connection.data()?.createdAt as string | undefined;
    const receivedAfterConnection = Boolean(connectedAt && mail.receivedAt >= connectedAt);
    if (
      (phase === "live" || receivedAfterConnection) &&
      latest &&
      owner.data()?.telegram?.chatId
    ) {
      queueTelegramNotification(tx, uid, `${connectionId}:${mail.id}`, {
        company: classification.company,
        role: classification.role,
        status: classification.status,
        summary: classification.summary,
        receivedAt: mail.receivedAt,
      });
    }
  });
}

export async function syncConnection(id: string, expectedUID?: string, force = false) {
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
    if (!force && c.nextSyncAt > Date.now() && c.lastSyncAt)
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
    const recorded: Array<{ mail: MailInput; classification: Classification }> = [...known];
    if (pending.length) {
      const results =
        pending.length === 1
          ? [await classify(pending[0], connection.uid)]
          : await classifyBatch(pending, connection.uid);
      for (const [index, mail] of pending.entries()) {
        recorded.push({ mail, classification: results[index] });
      }
    }
    // Message transactions touch independent receipts and application threads. Run them
    // together so a six-message page does not pay six sequential database round trips.
    await Promise.all(
      recorded.map(({ mail, classification }) =>
        recordMail(connection.uid, id, mail, classification, phase),
      ),
    );
    processed = recorded.length;
    const receiptRefs = candidates.map((mail) =>
      userRef(connection.uid)
        .collection("receipts")
        .doc(hash(`${id}:${mail.id}`)),
    );
    let pageDone = false;
    await db().runTransaction(async (tx) => {
      const [current, throttle, ...receipts] = await Promise.all([
        tx.get(ref),
        tx.get(db().collection("system").doc("aiThrottle")),
        ...receiptRefs.map((receiptRef) => tx.get(receiptRef)),
      ]);
      if (!current.exists || current.data()?.lockId !== lockId) return;
      if (current.data()?.status !== "connected") {
        tx.update(ref, { lockUntil: 0, lockId: "" });
        return;
      }
      const newlyCounted = receipts.flatMap((receipt, index) => {
        if (!receipt.exists || receipt.data()?.counted !== false) return [];
        tx.update(receiptRefs[index], { counted: true });
        return [receipt.data()!];
      });
      const newlyImported = newlyCounted.filter((receipt) => receipt.phase === "import");
      pageDone = receipts.every((receipt) => receipt.exists);
      tx.update(ref, {
        processed: (current.data()?.processed || 0) + newlyCounted.length,
        ...(newlyImported.length
          ? {
              importChecked: (current.data()?.importChecked || 0) + newlyImported.length,
              importMatched:
                (current.data()?.importMatched || 0) +
                newlyImported.filter((receipt) => receipt.relevant).length,
            }
          : {}),
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
              ? 60000
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
  if (process.env.MAIL_PROCESSING_ENABLED !== "true")
    return { processed: 0, checked: 0, failed: 0 };
  // Earliest due mailbox first. The composite index is tracked in firestore.indexes.json.
  let processed = 0;
  let checked = 0;
  let failed = 0;
  const checkedConnections = new Set<string>();
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
      if (checkedConnections.has(doc.id)) continue;
      checkedConnections.add(doc.id);
      if (doc.data().status !== "connected" || doc.data().provider === "import") continue;
      try {
        const result = await syncConnection(doc.id);
        checked++;
        processed += result.processed;
        progress = true;
      } catch (error) {
        checked++;
        failed++;
        if (error instanceof AppError && error.status === 429 && error.code !== "PERSONAL_BUDGET")
          return { processed, checked, failed };
      }
      if (processed >= maxMessages || Date.now() >= deadline) break;
    }
    if (!progress) break;
    if (processed < maxMessages) {
      const throttle = await db().collection("system").doc("aiThrottle").get();
      const remaining = Math.min(deadline - Date.now(), (throttle.data()?.until || 0) - Date.now());
      if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
    }
  }
  return { processed, checked, failed };
}
