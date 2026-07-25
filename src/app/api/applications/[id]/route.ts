import { NextResponse } from "next/server";
import { applicationPatchSchema } from "@/lib/domain";
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
      if (!owner.exists || owner.data()?.deleting || !app.exists)
        throw new AppError("Application not found.", 404);
      tx.update(ref, { ...patch, ...(patch.status ? { manualStatus: true } : {}) });
    });
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
      { events: events.docs.map((d) => d.data()) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return responseError(error);
  }
}
