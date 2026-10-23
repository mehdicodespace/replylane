import { NextResponse } from "next/server";
import {
  authenticate,
  db,
  userRef,
  responseError,
  jsonBody,
  adminAuth,
  hash,
} from "@/lib/server/core";
import { assessmentStageStatus, linkedInApplicationDetails } from "@/lib/domain";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const uid = await authenticate(request);
    const active = await db().runTransaction(async (tx) => {
      const owner = await tx.get(userRef(uid));
      if (owner.data()?.deleting) return false;
      tx.set(userRef(uid), { updatedAt: new Date().toISOString() }, { merge: true });
      return true;
    });
    if (!active)
      return NextResponse.json({ error: "This account is being deleted." }, { status: 409 });
    const [applications, connections, usage] = await Promise.all([
      userRef(uid).collection("applications").orderBy("receivedAt", "desc").limit(200).get(),
      db().collection("connections").where("uid", "==", uid).get(),
      userRef(uid).collection("usage").doc(new Date().toISOString().slice(0, 10)).get(),
    ]);
    const safeConnections = connections.docs.map((d) => {
      const c = d.data();
      return {
        id: d.id,
        provider: c.provider,
        email: c.email,
        status: c.status,
        lastSyncAt: c.lastSyncAt,
        processed: c.processed,
        importComplete: c.importComplete,
        error: c.error,
        since: c.since,
        createdAt: c.createdAt,
        importDays: c.importDays || 0,
        historyDaysCompleted:
          c.historyDaysCompleted ??
          (c.importComplete
            ? c.importDays ||
              (c.since && c.createdAt
                ? Math.max(
                    0,
                    Math.min(
                      60,
                      Math.round(
                        (new Date(c.createdAt).getTime() - new Date(c.since).getTime()) / 86400000,
                      ),
                    ),
                  )
                : 0)
            : 0),
        importStartedAt: c.importStartedAt || null,
        importChecked: c.importChecked || 0,
        importMatched: c.importMatched || 0,
        syncing: c.lockUntil > Date.now(),
        nextSyncAt: c.nextSyncAt || 0,
      };
    });
    return NextResponse.json(
      {
        applications: applications.docs.map((d) => {
          const application = d.data();
          const status = assessmentStageStatus(
            `${application.subject || ""}\n${application.excerpt || ""}\n${application.summary || ""}`,
            application.status,
            application.manualStatus,
          );
          const linkedinDetails = linkedInApplicationDetails(application.subject || "");
          return {
            ...application,
            ...(status !== application.status ? { status, aiStatus: status } : {}),
            ...(linkedinDetails && application.role?.toLowerCase() === "role not specified"
              ? { role: linkedinDetails.role }
              : {}),
            ...(linkedinDetails && application.company?.toLowerCase() === "unknown company"
              ? { company: linkedinDetails.company }
              : {}),
          };
        }),
        connections: safeConnections,
        usage: {
          requests: 0,
          tokens: 0,
          ...usage.data(),
          requestLimit: Number(process.env.AI_USER_DAILY_REQUEST_BUDGET || 300),
        },
        hasMore: applications.size === 200,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return responseError(error);
  }
}
export async function DELETE(request: Request) {
  try {
    const uid = await authenticate(request, true);
    const body = await jsonBody(request);
    if (body.confirmation !== "DELETE")
      return NextResponse.json({ error: "Type DELETE to confirm." }, { status: 400 });
    await userRef(uid).set({ deleting: true }, { merge: true });
    const owner = await userRef(uid).get();
    const chatId = owner.data()?.telegram?.chatId as string | undefined;
    if (chatId)
      await db()
        .collection("telegramChatLinks")
        .doc(hash(String(chatId)))
        .delete();
    const connections = await db().collection("connections").where("uid", "==", uid).get();
    for (const connection of connections.docs) await connection.ref.delete();
    const [outbox, linkTokens] = await Promise.all([
      db().collection("telegramOutbox").where("uid", "==", uid).get(),
      db().collection("telegramLinkTokens").where("uid", "==", uid).get(),
    ]);
    const auxiliaryDocs = [...outbox.docs, ...linkTokens.docs];
    for (let start = 0; start < auxiliaryDocs.length; start += 400) {
      const batch = db().batch();
      auxiliaryDocs.slice(start, start + 400).forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
    for (const action of ["connect", "sync", "import", "telegram-link"])
      await db()
        .collection("rateLimits")
        .doc(hash(`${uid}:${action}`))
        .delete();
    // Keep the deleting tombstone until Firebase Auth has been removed; no route
    // or worker may recreate data during the cleanup window.
    for (const collection of await userRef(uid).listCollections())
      await db().recursiveDelete(collection);
    await adminAuth().deleteUser(uid);
    await userRef(uid).delete();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return responseError(error);
  }
}
