import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  authenticate,
  responseError,
  jsonBody,
  requireProcessing,
  encrypted,
  appURL,
  rateLimit,
  userRef,
} from "@/lib/server/core";
import { authorizationURL, importRange } from "@/lib/server/providers";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const uid = await authenticate(request);
    requireProcessing();
    await rateLimit(uid, "connect", 30);
    const body = z
      .object({
        provider: z.enum(["google", "microsoft"]),
        days: importRange,
        consent: z.literal(true),
      })
      .parse(await jsonBody(request));
    const owner = await userRef(uid).get();
    if (owner.data()?.deleting) throw new Error("Account deleting");
    await userRef(uid).set({ updatedAt: new Date().toISOString() }, { merge: true });
    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(48).toString("base64url");
    const response = NextResponse.json({ url: authorizationURL(body.provider, state, verifier) });
    response.cookies.set(
      "replylane_oauth",
      encrypted(
        JSON.stringify({
          uid,
          state,
          verifier,
          provider: body.provider,
          days: body.days,
          at: Date.now(),
        }),
        "oauth",
      ),
      {
        httpOnly: true,
        secure: appURL().startsWith("https:"),
        sameSite: "lax",
        maxAge: 600,
        path: "/api/mail/callback",
      },
    );
    return response;
  } catch (error) {
    return responseError(error);
  }
}
