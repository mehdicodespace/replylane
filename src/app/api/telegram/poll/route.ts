import { NextResponse } from "next/server";
import { authenticate, responseError } from "@/lib/server/core";
import { drainTelegramOutbox, pollTelegramUpdates } from "@/lib/server/telegram";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await authenticate(request);
    const result = await pollTelegramUpdates();
    const delivery = await drainTelegramOutbox(10);
    return NextResponse.json(
      { ...result, sent: delivery.sent },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return responseError(error);
  }
}
