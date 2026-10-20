import { NextResponse } from "next/server";
import { authenticate, db, hash, rateLimit, responseError, userRef } from "@/lib/server/core";
import {
  createTelegramLink,
  telegramConfigured,
  telegramLocalPollingEnabled,
} from "@/lib/server/telegram";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const uid = await authenticate(request);
    const owner = await userRef(uid).get();
    const telegram = owner.data()?.telegram;
    return NextResponse.json({
      configured: telegramConfigured(),
      localPolling: telegramConfigured() && telegramLocalPollingEnabled(),
      connected: Boolean(telegram?.chatId),
      linkedAt: telegram?.linkedAt || null,
      botUsername: telegramConfigured()
        ? process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "")
        : null,
    });
  } catch (error) {
    return responseError(error);
  }
}

export async function POST(request: Request) {
  try {
    const uid = await authenticate(request);
    await rateLimit(uid, "telegram-link", 30);
    const owner = await userRef(uid).get();
    if (!owner.exists || owner.data()?.deleting)
      return NextResponse.json({ error: "This account is unavailable." }, { status: 409 });
    const result = await createTelegramLink(uid);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return responseError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const uid = await authenticate(request);
    await db().runTransaction(async (tx) => {
      const ownerRef = userRef(uid);
      const owner = await tx.get(ownerRef);
      const chatId = owner.data()?.telegram?.chatId as string | undefined;
      if (chatId)
        tx.delete(
          db()
            .collection("telegramChatLinks")
            .doc(hash(String(chatId))),
        );
      tx.update(ownerRef, { telegram: null });
    });
    const pending = await db().collection("telegramOutbox").where("uid", "==", uid).get();
    const batch = db().batch();
    pending.docs.forEach((doc) => batch.delete(doc.ref));
    if (!pending.empty) await batch.commit();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return responseError(error);
  }
}
