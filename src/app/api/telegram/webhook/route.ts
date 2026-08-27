import { NextResponse } from "next/server";
import { handleTelegramUpdate, validateTelegramSecret } from "@/lib/server/telegram";
import { jsonBody } from "@/lib/server/core";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function POST(request: Request) {
  if (!validateTelegramSecret(request.headers.get("X-Telegram-Bot-Api-Secret-Token")))
    return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const update = await jsonBody(request, 20000);
    if (typeof update !== "object" || update === null || Array.isArray(update))
      return NextResponse.json({ ok: true });
    await handleTelegramUpdate(update as Record<string, unknown>);
    return NextResponse.json({ ok: true });
  } catch {
    // Telegram retries non-2xx responses; never echo webhook input or API secrets.
    return NextResponse.json({ ok: true });
  }
}
