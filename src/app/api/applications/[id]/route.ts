import { NextResponse } from "next/server";
import { applicationPatchSchema, assessmentStageStatus } from "@/lib/domain";
import { authenticate, userRef, responseError, jsonBody, AppError, db } from "@/lib/server/core";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, context: Context) {
  try {
    const uid = await authenticate(request);
    const { id } = await context.params;
    if (!/^[a-f0-9]{64}$/.test(id)) throw new AppError("Application not found.", 404);
    const patch = applicationPatchSchema.parse(await jsonBody(request));
    const ref = userRef(uid).collection("applications").doc(id);
    await db().runTransaction(async (tx) => {
      const [owner, app] = await Promise.all([tx.get(userRef(uid)), tx.get(ref)]);
      if (!owner.exists || owner.data()?.deleting || !app.exists || app.data()?.permanentlyDeleting)
        throw new AppError("Application not found.", 404);
      tx.update(ref, { ...patch, ...(patch.status ? { manualStatus: true } : {}) });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return responseError(error);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    const uid = await authenticate(request);
    const { id } = await context.params;
    if (!/^[a-f0-9]{64}$/.test(id)) throw new AppError("Application not found.", 404);
    const ownerRef = userRef(uid);
    const ref = ownerRef.collection("applications").doc(id);
    await db().runTransaction(async (tx) => {
      const [owner, app] = await Promise.all([tx.get(ownerRef), tx.get(ref)]);
      if (!owner.exists || owner.data()?.deleting || !app.exists)
        throw new AppError("Application not found.", 404);
      if (!app.data()?.trashed)
        throw new AppError("Move this reply to Trash before deleting it permanently.", 409);
      if (app.data()?.permanentlyDeleting)
        throw new AppError("This reply is already being deleted.", 409);
      tx.update(ref, { permanentlyDeleting: true });
    });
    await db().recursiveDelete(ref);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return responseError(error);
  }
}
export async function GET(request: Request, context: Context) {
  try {
    const uid = await authenticate(request);
    const { id } = await context.params;
    if (!/^[a-f0-9]{64}$/.test(id)) throw new AppError("Application not found.", 404);
    const events = await userRef(uid)
      .collection("applications")
      .doc(id)
      .collection("events")
      .orderBy("receivedAt", "desc")
      .limit(100)
      .get();
    return NextResponse.json(
      {
        events: events.docs.map((d) => {
          const event = d.data();
          return {
            ...event,
            status: assessmentStageStatus(
              `${event.subject || ""}\n${event.excerpt || ""}\n${event.summary || ""}`,
              event.status,
            ),
          };
        }),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return responseError(error);
  }
}
