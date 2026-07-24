import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, requireProcessing, rateLimit, jsonBody, responseError } from "@/lib/server/core";
import { syncConnection } from "@/lib/server/sync";
export const runtime="nodejs";
export const maxDuration=60;
export async function POST(request:Request) {
  try {
    const uid=await authenticate(request);requireProcessing();await rateLimit(uid,"sync",10);
    const {id}=z.object({id:z.string().regex(/^[a-f0-9]{64}$/)}).parse(await jsonBody(request));
    return NextResponse.json(await syncConnection(id,uid));
  } catch(error){return responseError(error);}
}
