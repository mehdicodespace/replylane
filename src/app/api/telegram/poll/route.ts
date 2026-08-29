import { NextResponse } from "next/server";
import { authenticate, responseError } from "@/lib/server/core";
import { pollTelegramUpdates } from "@/lib/server/telegram";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await authenticate(request);
    const result = await pollTelegramUpdates();
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return responseError(error);
  }
}
