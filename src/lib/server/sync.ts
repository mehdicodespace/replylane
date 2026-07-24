import { randomUUID } from "node:crypto";
import { classify, PROMPT_VERSION } from "./ai";
import { AppError, db, hash, userRef } from "./core";
import { accessToken, gmailPage, microsoftPage, imapPage, type ConnectionSecret } from "./providers";
import type { Classification, MailInput, Application } from "../domain";

export async function recordMail(uid:string, connectionId:string, mail:MailInput, result:Classification) {
  const receipt = userRef(uid).collection("receipts").doc(hash(`${connectionId}:${mail.id}`));
  const appId = hash(`${connectionId}:${mail.threadId}`);
  const app = userRef(uid).collection("applications").doc(appId);
  const event = app.collection("events").doc(hash(mail.id));
  await db().runTransaction(async tx => {
    const [seen, current, owner, connection] = await Promise.all([tx.get(receipt), tx.get(app), tx.get(userRef(uid)), tx.get(db().collection("connections").doc(connectionId))]);
    // Prevent a concurrent disconnect/deletion from recreating data after cleanup.
    if (!owner.exists || owner.data()?.deleting || !connection.exists || connection.data()?.status !== "connected") throw new AppError("This connection is no longer active.",409);
    if (seen.exists) return;
    tx.set(receipt,{connectionId,processedAt:new Date().toISOString(),relevant:result.relevant,promptVersion:PROMPT_VERSION});
    if (!result.relevant) return;
    const existing = current.data() as Application | undefined;
    const latest = !existing || mail.receivedAt >= existing.receivedAt;
    tx.set(event,{ id:hash(mail.id),subject:mail.subject.slice(0,500),summary:result.summary,status:result.status,receivedAt:mail.receivedAt,excerpt:mail.text.slice(0,5000) });
    if (!latest) return;
    const status = existing?.manualStatus ? existing.status : result.status;
    tx.set(app,{
      id:appId,company:result.company,role:result.role,subject:mail.subject.slice(0,500),sender:mail.sender.slice(0,300),senderEmail:mail.senderEmail.slice(0,300),
      summary:result.summary,excerpt:mail.text.slice(0,5000),status,aiStatus:result.status,manualStatus:existing?.manualStatus || false,confidence:result.confidence,
      language:result.language,receivedAt:mail.receivedAt,nextAction:result.nextAction,deadline:existing?.deadline || result.deadline,
      starred:existing?.starred || false,archived:existing?.archived || false,notes:existing?.notes || "",connectionId,
      provider:connection.data()?.provider,messageUrl:mail.messageUrl,
    });
  });
}

export async function syncConnection(id:string, expectedUID?:string) {
  const ref = db().collection("connections").doc(id); const lockId=randomUUID();
  const connection = await db().runTransaction(async tx => {
    const snap=await tx.get(ref); const c=snap.data() as ConnectionSecret | undefined;
    if (!c || expectedUID && c.uid !== expectedUID) throw new AppError("Mailbox not found.",404);
    if (c.status !== "connected") throw new AppError("Resume or reconnect this mailbox before syncing.",409);
    const owner=await tx.get(userRef(c.uid));
    if (!owner.exists || owner.data()?.deleting) throw new AppError("This account is unavailable.",409);
    if (c.lockUntil > Date.now()) throw new AppError("This mailbox is already syncing.",409);
    if (c.nextSyncAt > Date.now() && c.lastSyncAt) throw new AppError("Your next sync is queued. Please wait a moment.",429);
    // Longer than the maximum provider/AI work in a single invocation.
    tx.update(ref,{lockUntil:Date.now()+240000,lockId}); return c;
  });
  let processed=0;
  try {
    let page;
    if(connection.provider === "google" || connection.provider === "microsoft") {
      const token=await accessToken(connection,id);
      if(token.rotated) await ref.update({secret:token.rotated});
      page=connection.provider === "google" ? await gmailPage(connection,token.access) : await microsoftPage(connection,token.access);
    } else page=await imapPage(connection,id);
    for (const mail of page.messages) {
      if (mail.receivedAt < connection.since || mail.senderEmail.toLowerCase() === connection.email.toLowerCase()) continue;
      const seen=await userRef(connection.uid).collection("receipts").doc(hash(`${id}:${mail.id}`)).get();
      if (seen.exists) continue;
      // One AI call per invocation keeps function duration bounded. A partially
      // processed page stays put; receipts skip its earlier messages on retry.
      if (processed >= 1) break;
      const result=await classify(mail,connection.uid);
      await recordMail(connection.uid,id,mail,result); processed++;
    }
    const receipts = await Promise.all(page.messages.filter(m=>m.receivedAt>=connection.since && m.senderEmail.toLowerCase()!==connection.email.toLowerCase()).map(m=>userRef(connection.uid).collection("receipts").doc(hash(`${id}:${m.id}`)).get()));
    const pageDone=receipts.every(r=>r.exists);
    await db().runTransaction(async tx=>{
      const current=await tx.get(ref);
      if(!current.exists || current.data()?.lockId!==lockId) return;
      tx.update(ref,{
        ...(pageDone ? {cursor:page.cursor,importComplete:connection.importComplete || page.complete} : {}),
        processed:connection.processed+processed,lastSyncAt:new Date().toISOString(),error:null,failures:0,
        nextSyncAt:Date.now()+(pageDone && page.complete ? 15*60000 : 10000),lockUntil:0,lockId:"",
      });
    });
    return {processed,hasMore:!pageDone || !page.complete};
  } catch(error) {
    const known=error instanceof AppError;
    const failures=(connection.failures || 0)+1;
    // Unparseable or failed inference is never silently discarded or relabeled.
    const delay=known && error.status===429 ? 15*60000 : Math.min(6*3600000,60000*2**Math.min(failures,8));
    await db().runTransaction(async tx=>{
      const current=await tx.get(ref);
      if(!current.exists || current.data()?.lockId!==lockId) return;
      tx.update(ref,{lockUntil:0,lockId:"",nextSyncAt:Date.now()+delay,failures,
        error:known ? error.message : "Sync couldn't finish. Your messages remain queued for retry.",
        ...(known && error.status===401 ? {status:"error"} : {}),
      });
    });
    throw error;
  }
}

export async function scheduledSync() {
  if(process.env.MAIL_PROCESSING_ENABLED !== "true") return {processed:0};
  // Earliest due mailbox first. A single field index is sufficient.
  const due=await db().collection("connections").where("nextSyncAt","<=",Date.now()).orderBy("nextSyncAt").limit(5).get();
  let processed=0;
  for(const doc of due.docs) {
    if(doc.data().status!=="connected") continue;
    try { const result=await syncConnection(doc.id); processed+=result.processed; }
    catch(error) { if(error instanceof AppError && error.status===429) break; }
    // Keep scheduled function comfortably below a standard request timeout.
    if(processed>=1) break;
  }
  return {processed};
}
