import { AppError, db, userRef } from "./core";

export async function requestHistoryImport(id: string, uid: string, days: 30 | 60) {
  const ref = db().collection("connections").doc(id);
  await db().runTransaction(async (tx) => {
    const [snapshot, owner] = await Promise.all([tx.get(ref), tx.get(userRef(uid))]);
    const c = snapshot.data();
    if (!c || c.uid !== uid) throw new AppError("Mailbox not found.", 404);
    if (!owner.exists || owner.data()?.deleting) throw new AppError("Account unavailable.", 409);
    if (c.provider === "import" || c.status !== "connected")
      throw new AppError("Resume or reconnect this inbox before importing older emails.", 409);
    if (c.lockUntil > Date.now()) throw new AppError("A sync is running. Try again shortly.", 409);
    if (!c.importComplete) throw new AppError("An import is already in progress.", 409);
    const inferredCompleted =
      c.since && c.createdAt
        ? Math.max(
            0,
            Math.min(
              60,
              Math.round(
                (new Date(c.createdAt).getTime() - new Date(c.since).getTime()) / 86400000,
              ),
            ),
          )
        : 0;
    const completed = c.historyDaysCompleted ?? c.importDays ?? inferredCompleted;
    if (completed >= days)
      throw new AppError(
        `The last ${days} days have already been imported for this inbox. Choose a longer range if you want to check older messages.`,
        409,
      );
    // Keep the live boundary and its cursor intact. Receipts prevent duplicate cards
    // or AI calls when a later import includes messages already checked.
    const now = new Date().toISOString();
    tx.update(ref, {
      since: new Date(Date.now() - days * 86400000).toISOString(),
      cursor: null,
      importComplete: false,
      importDays: days,
      historyDaysCompleted: completed,
      importStartedAt: now,
      lastPhase: "live",
      nextSyncAt: Date.now(),
      error: null,
    });
  });
}
