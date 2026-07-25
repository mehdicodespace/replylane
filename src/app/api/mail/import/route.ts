import { NextResponse } from "next/server";
import {
  authenticate,
  requireProcessing,
  rateLimit,
  responseError,
  AppError,
  hash,
  userRef,
  db,
} from "@/lib/server/core";
import { parseEML } from "@/lib/server/providers";
import { classify } from "@/lib/server/ai";
import { recordMail } from "@/lib/server/sync";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const uid = await authenticate(request);
    requireProcessing();
    await rateLimit(uid, "import", 10);
    if (request.headers.get("x-ai-consent") !== "true")
      throw new AppError("Consent is required before processing an email.");
    if (!request.headers.get("content-type")?.startsWith("message/rfc822"))
      throw new AppError("Upload an .eml file.");
    const reader = request.body?.getReader();
    if (!reader) throw new AppError("An email file is required.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024 * 1024) {
        await reader.cancel();
        throw new AppError("Choose an email file smaller than 1 MB.", 413);
      }
      chunks.push(value);
    }
    const mail = await parseEML(Buffer.concat(chunks));
    const id = hash(`${uid}:import`);
    const receipt = await userRef(uid)
      .collection("receipts")
      .doc(hash(`${id}:${mail.id}`))
      .get();
    if (receipt.exists)
      return NextResponse.json({ relevant: receipt.data()?.relevant, duplicate: true });
    await db().runTransaction(async (tx) => {
      const owner = await tx.get(userRef(uid));
      if (owner.data()?.deleting) throw new AppError("This account is being deleted.", 409);
      tx.set(userRef(uid), { updatedAt: new Date().toISOString() }, { merge: true });
      tx.set(
        db().collection("connections").doc(id),
        {
          uid,
          provider: "import",
          email: "Email file imports",
          status: "connected",
          createdAt: new Date().toISOString(),
          nextSyncAt: Number.MAX_SAFE_INTEGER,
          lastSyncAt: null,
          processed: 0,
          importComplete: true,
          error: null,
        },
        { merge: true },
      );
    });
    const result = await classify(mail, uid);
    await recordMail(uid, id, mail, result);
    return NextResponse.json({ relevant: result.relevant, duplicate: false });
  } catch (error) {
    return responseError(error);
  }
}
