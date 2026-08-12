import { NextResponse } from "next/server";
import { authenticate, userRef, db, responseError, AppError, rateLimit } from "@/lib/server/core";
import { originalImapMail, type ConnectionSecret } from "@/lib/server/providers";
import { sanitizeEmailHTML } from "@/lib/server/email-html";
import { cleanEmailText } from "@/lib/email-content";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const uid = await authenticate(request);
    const { id } = await context.params;
    if (!/^[a-f0-9]{64}$/.test(id)) throw new AppError("Application not found.", 404);
    const appRef = userRef(uid).collection("applications").doc(id);
    const [app, owner, cached] = await Promise.all([
      appRef.get(),
      userRef(uid).get(),
      appRef.collection("messages").doc("latest").get(),
    ]);
    if (!app.exists || !owner.exists || owner.data()?.deleting)
      throw new AppError("Application not found.", 404);
    const a = app.data()!;
    let message = cached.data();
    if (!message || message.receivedAt !== a.receivedAt) {
      await rateLimit(uid, "original-message", 2);
      const connectionRef = db().collection("connections").doc(a.connectionId);
      const connection = await connectionRef.get();
      const c = connection.data() as ConnectionSecret | undefined;
      if (!c || c.uid !== uid)
        throw new AppError("Reconnect this inbox to load the formatted message.", 409);
      const original = await originalImapMail(c, connection.id, {
        receivedAt: a.receivedAt,
        subject: a.subject,
        senderEmail: a.senderEmail,
      });
      message = {
        receivedAt: a.receivedAt,
        html: original?.html ? sanitizeEmailHTML(original.html) : null,
        text: cleanEmailText(original?.text || a.excerpt).slice(0, 30000),
      };
      const content = message;
      await db().runTransaction(async (tx) => {
        const [current, currentOwner, currentConnection] = await Promise.all([
          tx.get(appRef),
          tx.get(userRef(uid)),
          tx.get(connectionRef),
        ]);
        if (
          !currentOwner.exists ||
          currentOwner.data()?.deleting ||
          !currentConnection.exists ||
          currentConnection.data()?.uid !== uid ||
          !current.exists ||
          current.data()?.receivedAt !== a.receivedAt
        )
          return;
        tx.set(appRef.collection("messages").doc("latest"), content);
      });
    }
    return NextResponse.json(
      {
        html: message.html ? sanitizeEmailHTML(message.html) : null,
        text: cleanEmailText(message.text || a.excerpt),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return responseError(error);
  }
}
