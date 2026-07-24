import { NextResponse } from "next/server";
import { authenticate, userRef, responseError, AppError } from "@/lib/server/core";
export const runtime="nodejs";
export async function GET(request:Request) {
  try {
    const uid=await authenticate(request);
    const url=new URL(request.url); const cursor=url.searchParams.get("cursor");
    let query=userRef(uid).collection("applications").orderBy("receivedAt","desc").limit(200);
    if(cursor) {
      if(!/^[a-f0-9]{64}$/.test(cursor)) throw new AppError("Invalid page cursor.");
      const doc=await userRef(uid).collection("applications").doc(cursor).get();
      if(!doc.exists) throw new AppError("Page cursor no longer exists. Refresh the workspace.");
      query=query.startAfter(doc);
    }
    const page=await query.get();
    return NextResponse.json({applications:page.docs.map(d=>d.data()),cursor:page.size===200 ? page.docs.at(-1)!.id : null},{headers:{"Cache-Control":"no-store"}});
  } catch(error){return responseError(error);}
}
