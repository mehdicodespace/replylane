import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, requireProcessing, jsonBody, rateLimit, userRef, responseError, db, hash, encrypted, AppError } from "@/lib/server/core";
import { importRange, tokenContext, verifyImap } from "@/lib/server/providers";
export const runtime="nodejs";
export async function POST(request:Request) {
  try {
    const uid=await authenticate(request);requireProcessing();await rateLimit(uid,"connect",30);
    const body=z.object({provider:z.enum(["yahoo","icloud","fastmail"]),email:z.email().max(254),password:z.string().min(8).max(256),days:importRange,consent:z.literal(true)}).parse(await jsonBody(request));
    await verifyImap(body.provider,body.email,body.password);
    const id=hash(`${uid}:${body.provider}:${body.email.toLowerCase()}`);
    await db().runTransaction(async tx=>{
      const [owner,existing]=await Promise.all([tx.get(userRef(uid)),tx.get(db().collection("connections").doc(id))]);
      if(owner.data()?.deleting) throw new AppError("This account is being deleted.",409);
      const prev=existing.data();
      tx.set(userRef(uid),{updatedAt:new Date().toISOString()},{merge:true});
      tx.set(db().collection("connections").doc(id),{uid,provider:body.provider,email:body.email,
        secret:encrypted(body.password,tokenContext(uid,id)),createdAt:prev?.createdAt || new Date().toISOString(),
        since:prev?.since || new Date(Date.now()-body.days*86400000).toISOString(),cursor:prev?.cursor || null,
        importComplete:prev?.importComplete || body.days===0,processed:prev?.processed || 0,lastSyncAt:prev?.lastSyncAt || null,
        nextSyncAt:Date.now(),status:"connected",error:null,lockUntil:0,consentAt:new Date().toISOString(),consentVersion:"2026-10-21",
      });
    });
    return NextResponse.json({ok:true});
  } catch(error){return responseError(error);}
}
