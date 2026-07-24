import { NextResponse } from "next/server";
import { authenticate, db, userRef, responseError, jsonBody, adminAuth } from "@/lib/server/core";
export const runtime="nodejs";
export async function GET(request:Request) {
  try {
    const uid=await authenticate(request);
    const owner=await userRef(uid).get();
    if(owner.data()?.deleting) return NextResponse.json({error:"This account is being deleted."},{status:409});
    await userRef(uid).set({updatedAt:new Date().toISOString()},{merge:true});
    const [applications,connections,usage]=await Promise.all([
      userRef(uid).collection("applications").orderBy("receivedAt","desc").limit(200).get(),
      db().collection("connections").where("uid","==",uid).get(),
      userRef(uid).collection("usage").doc(new Date().toISOString().slice(0,10)).get(),
    ]);
    const safeConnections=connections.docs.map(d=>{const c=d.data();return {id:d.id,provider:c.provider,email:c.email,status:c.status,lastSyncAt:c.lastSyncAt,processed:c.processed,importComplete:c.importComplete,error:c.error};});
    return NextResponse.json({applications:applications.docs.map(d=>d.data()),connections:safeConnections,usage:usage.data() || {requests:0,tokens:0},hasMore:applications.size===200},{headers:{"Cache-Control":"no-store"}});
  } catch(error){return responseError(error);}
}
export async function DELETE(request:Request) {
  try {
    const uid=await authenticate(request,true);
    const body=await jsonBody(request);
    if(body.confirmation!=="DELETE") return NextResponse.json({error:"Type DELETE to confirm."},{status:400});
    await userRef(uid).set({deleting:true},{merge:true});
    const connections=await db().collection("connections").where("uid","==",uid).get();
    for(const connection of connections.docs) await connection.ref.delete();
    await db().recursiveDelete(userRef(uid));
    await adminAuth().deleteUser(uid);
    return NextResponse.json({ok:true});
  } catch(error){return responseError(error);}
}
