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
      };
    });
    return NextResponse.json(
      {
        applications: applications.docs.map((d) => d.data()),
        connections: safeConnections,
        usage: usage.data() || { requests: 0, tokens: 0 },
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
    const connections = await db().collection("connections").where("uid", "==", uid).get();
    for (const connection of connections.docs) await connection.ref.delete();
    for (const action of ["connect", "sync", "import"])
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
