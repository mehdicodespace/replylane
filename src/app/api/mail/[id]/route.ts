import { NextResponse } from "next/server";
import { z } from "zod";
import {
  authenticate,
  db,
  responseError,
  jsonBody,
  AppError,
  requireProcessing,
  rateLimit,
} from "@/lib/server/core";
import { requestHistoryImport } from "@/lib/server/history";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
async function owned(request: Request, context: Context) {
  const uid = await authenticate(request);
  const { id } = await context.params;
  if (!/^[a-f0-9]{64}$/.test(id)) throw new AppError("Mailbox not found.", 404);
  const ref = db().collection("connections").doc(id);
  const doc = await ref.get();
  if (!doc.exists || doc.data()?.uid !== uid) throw new AppError("Mailbox not found.", 404);
  return ref;
}
export async function PATCH(request: Request, context: Context) {
  try {
    const ref = await owned(request, context);
    const body = z
      .union([
        z.object({ paused: z.boolean() }).strict(),
        z
          .object({
            historyDays: z.union([z.literal(30), z.literal(60)]),
            consent: z.literal(true),
          })
          .strict(),
      ])
      .parse(await jsonBody(request));
    if ("historyDays" in body) {
      requireProcessing();
      const uid = await authenticate(request);
      await rateLimit(uid, "history", 30);
      await requestHistoryImport(ref.id, uid, body.historyDays);
      return NextResponse.json({ ok: true });
    }
    await ref.update({
      status: body.paused ? "paused" : "connected",
      nextSyncAt: body.paused ? Number.MAX_SAFE_INTEGER : Date.now(),
      error: null,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return responseError(error);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    const ref = await owned(request, context);
    await ref.delete();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return responseError(error);
  }
}
