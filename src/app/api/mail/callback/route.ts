import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { appURL, decrypted, encrypted, db, hash, userRef, adminAuth } from "@/lib/server/core";
import { exchangeCode, mailProfile, tokenContext } from "@/lib/server/providers";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const redirect = (value: string) => {
    const response = NextResponse.redirect(
      `${appURL()}/app?section=connections&connection=${value}`,
    );
    response.cookies.set("replylane_oauth", "", { maxAge: 0, path: "/api/mail/callback" });
    return response;
  };
  try {
    const cookie = request.cookies.get("replylane_oauth")?.value;
    if (!cookie) return redirect("expired");
    const state = JSON.parse(decrypted(cookie, "oauth")) as {
      uid: string;
      state: string;
      verifier: string;
      provider: "google" | "microsoft";
      days: 0 | 30 | 60;
      at: number;
    };
    const received = request.nextUrl.searchParams.get("state") || "";
    if (
      received.length !== state.state.length ||
      !timingSafeEqual(Buffer.from(received), Buffer.from(state.state)) ||
      Date.now() - state.at > 600000
    )
      return redirect("expired");
    if (request.nextUrl.searchParams.get("error")) return redirect("declined");
    const code = request.nextUrl.searchParams.get("code");
    if (!code) return redirect("failed");
    const [user, owner] = await Promise.all([
      adminAuth().getUser(state.uid),
      userRef(state.uid).get(),
    ]);
    if (user.disabled || !owner.exists || owner.data()?.deleting) return redirect("expired");
    const token = await exchangeCode(state.provider, code, state.verifier);
    if (!token.refresh_token) return redirect("reconnect");
    if (state.provider === "google" && !token.scope?.includes("gmail.readonly"))
      return redirect("declined");
    if (state.provider === "microsoft" && !token.scope?.toLowerCase().includes("mail.read"))
      return redirect("declined");
    const email = await mailProfile(state.provider, token.access_token);
    const id = hash(`${state.uid}:${state.provider}:${email.toLowerCase()}`);
    await db().runTransaction(async (tx) => {
      const [existing, activeOwner] = await Promise.all([
        tx.get(db().collection("connections").doc(id)),
        tx.get(userRef(state.uid)),
      ]);
      if (!activeOwner.exists || activeOwner.data()?.deleting)
        throw new Error("Account unavailable");
      const previous = existing.data();
      const since = new Date(Date.now() - state.days * 86400000).toISOString();
      tx.set(db().collection("connections").doc(id), {
        uid: state.uid,
        provider: state.provider,
        email,
        secret: encrypted(token.refresh_token!, tokenContext(state.uid, id)),
        createdAt: previous?.createdAt || new Date().toISOString(),
        since: previous?.since || since,
        importDays: previous?.importDays ?? state.days,
        cursor: previous?.cursor || null,
        liveCursor: previous?.liveCursor || null,
        lastPhase: previous?.lastPhase || "import",
        importComplete: previous?.importComplete || state.days === 0,
        processed: previous?.processed || 0,
        lastSyncAt: previous?.lastSyncAt || null,
        nextSyncAt: Date.now(),
        status: "connected",
        error: null,
        lockUntil: 0,
        consentAt: new Date().toISOString(),
        consentVersion: "2026-10-21",
      });
    });
    return redirect("success");
  } catch {
    return redirect("failed");
  }
}
