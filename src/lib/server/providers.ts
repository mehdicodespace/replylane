import { simpleParser } from "mailparser";
import { ImapFlow } from "imapflow";
import { z } from "zod";
import { AppError, appURL, decrypted, encrypted, env, hash } from "./core";
import type { MailInput } from "../domain";

export const importRange = z.union([z.literal(0), z.literal(30), z.literal(60)]);
export const imapHosts = { yahoo: "imap.mail.yahoo.com", icloud: "imap.mail.me.com", fastmail: "imap.fastmail.com" } as const;
export type Provider = "google" | "microsoft" | keyof typeof imapHosts;
export interface ConnectionSecret {
  uid: string; provider: Provider; email: string; secret: string; createdAt: string; since: string;
  cursor: string | null; importComplete: boolean; processed: number;
  lastSyncAt: string | null; nextSyncAt: number; status: "connected" | "paused" | "error"; error: string | null;
  lockUntil: number; lockId?: string; failures?: number;
}
export const tokenContext = (uid: string, id: string) => `mail:${uid}:${id}`;
const oauthConfig = (provider: "google" | "microsoft") => provider === "google" ? {
  authorize: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token",
  id: env("GOOGLE_CLIENT_ID"), secret: env("GOOGLE_CLIENT_SECRET"), scope: "https://www.googleapis.com/auth/gmail.readonly",
} : {
  authorize: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize", token: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
  id: env("MICROSOFT_CLIENT_ID"), secret: env("MICROSOFT_CLIENT_SECRET"), scope: "offline_access https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/User.Read",
};
export function authorizationURL(provider: "google" | "microsoft", state: string, verifier: string) {
  const c = oauthConfig(provider);
  const challenge = Buffer.from(hash(verifier), "hex").toString("base64url");
  const params = new URLSearchParams({ client_id: c.id, redirect_uri: `${appURL()}/api/mail/callback`, response_type: "code", scope: c.scope, state, code_challenge: challenge, code_challenge_method: "S256", prompt: "consent" });
  if (provider === "google") params.set("access_type", "offline");
  return `${c.authorize}?${params}`;
}
export async function exchangeCode(provider: "google" | "microsoft", code: string, verifier: string) {
  const c = oauthConfig(provider);
  return await tokenRequest(c.token, new URLSearchParams({ client_id: c.id, client_secret: c.secret, grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: `${appURL()}/api/mail/callback` }));
}
async function tokenRequest(url: string, body: URLSearchParams): Promise<{ access_token: string; refresh_token?: string; scope?: string }> {
  const response = await fetch(url, { method: "POST", body, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new AppError("The mail connection has expired or was declined. Please reconnect it.", 401);
  return await response.json();
}
export async function accessToken(c: ConnectionSecret, id: string) {
  if (c.provider !== "google" && c.provider !== "microsoft") throw new AppError("Unsupported OAuth provider.");
  const config = oauthConfig(c.provider);
  const token = await tokenRequest(config.token, new URLSearchParams({ client_id: config.id, client_secret: config.secret, grant_type: "refresh_token", refresh_token: decrypted(c.secret, tokenContext(c.uid,id)), ...(c.provider === "microsoft" ? { scope: config.scope } : {}) }));
  return { access: token.access_token, rotated: token.refresh_token ? encrypted(token.refresh_token, tokenContext(c.uid,id)) : null };
}
async function fetchJSON<T>(url: string, token: string): Promise<T> {
  const u = new URL(url);
  if (!(["gmail.googleapis.com", "graph.microsoft.com"].includes(u.hostname)) || u.protocol !== "https:") throw new AppError("Invalid mail pagination link.", 400);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.body-content-type="text", IdType="ImmutableId"' }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) {
    if (response.status === 404 || response.status === 410) throw new AppError("Mail cursor expired.", 410);
    throw new AppError(response.status === 401 ? "Please reconnect this mailbox." : "Your email provider is temporarily unavailable. Sync will retry.", response.status === 401 ? 401 : 503);
  }
  return response.json() as Promise<T>;
}
export async function mailProfile(provider: "google" | "microsoft", token: string) {
  if (provider === "google") {
    const p = await fetchJSON<{ emailAddress: string }>("https://gmail.googleapis.com/gmail/v1/users/me/profile", token);
    return p.emailAddress;
  }
  const p = await fetchJSON<{ mail?: string; userPrincipalName: string }>("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", token);
  return p.mail || p.userPrincipalName;
}
export function plainHTML(html: string) {
  return html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "").replace(/<br\s*\/?>|<\/(p|div|li|tr)>/gi, "\n").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&#39;|&apos;/g,"'").replace(/&quot;/g,'"').trim();
}
interface GmailPart { mimeType?: string; body?: { data?: string }; parts?: GmailPart[]; headers?: { name: string; value: string }[] }
function gmailText(part: GmailPart, mime: string): string {
  const own = part.mimeType === mime && part.body?.data ? Buffer.from(part.body.data,"base64url").toString("utf8") : "";
  return [own, ...(part.parts || []).map(p => gmailText(p,mime))].filter(Boolean).join("\n");
}
export interface MailPage { messages: MailInput[]; cursor: string; complete: boolean; }

// Gmail uses a bounded date query on every cycle, with idempotent receipts. This avoids
// missing messages when history cursors expire. The range starts at the chosen boundary.
// Each page is checkpointed only after every message on it is recorded.
export async function gmailPage(c: ConnectionSecret, token: string): Promise<MailPage> {
  const cursor = c.cursor ? JSON.parse(c.cursor) as { page?: string; after?: string; before?: string } : {};
  const after = cursor.after || c.since;
  const before = cursor.before || new Date().toISOString();
  const params = new URLSearchParams({ q: `after:${Math.floor(new Date(after).getTime()/1000)} before:${Math.ceil(new Date(before).getTime()/1000)} -in:sent -in:drafts`, maxResults: "3" });
  if (cursor.page) params.set("pageToken",cursor.page);
  let list: { messages?: { id:string }[]; nextPageToken?: string };
  try { list = await fetchJSON(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,token); }
  catch (error) { if (error instanceof AppError && error.status === 410) return { messages: [], cursor: JSON.stringify({ after, before }), complete: false }; throw error; }
  const messages: MailInput[] = [];
  for (const entry of list.messages || []) {
    let m: { id:string; threadId:string; internalDate:string; payload:GmailPart; snippet:string };
    try { m = await fetchJSON(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${entry.id}?format=full`,token); }
    catch(error) { if(error instanceof AppError && error.status === 410) continue; throw error; }
    const header = (name:string) => m.payload.headers?.find(h => h.name.toLowerCase() === name)?.value || "";
    const from = header("from"); const senderEmail = from.match(/<([^>]+)>/)?.[1] || from;
    messages.push({ id:m.id, threadId:m.threadId, subject:header("subject"), sender:from.replace(/<[^>]+>/g,"").replaceAll('"',"").trim(), senderEmail, receivedAt:new Date(Number(m.internalDate)).toISOString(), text:gmailText(m.payload,"text/plain") || plainHTML(gmailText(m.payload,"text/html")) || m.snippet, messageUrl:`https://mail.google.com/mail/u/${encodeURIComponent(c.email)}/#all/${m.threadId}` });
  }
  const complete = !list.nextPageToken;
  // One-second overlap prevents boundary rounding gaps. Receipts eliminate duplicates.
  return { messages, complete, cursor:JSON.stringify(complete ? { after:new Date(new Date(before).getTime()-1000).toISOString() } : { after,before,page:list.nextPageToken }) };
}

interface GraphMessage { id:string; conversationId:string; subject:string; from?: {emailAddress:{name:string;address:string}}; receivedDateTime:string; body?:{content:string;contentType:string}; bodyPreview?:string; webLink?:string; isDraft?:boolean; }
export async function microsoftPage(c: ConnectionSecret, token:string):Promise<MailPage> {
  const cursor = c.cursor ? JSON.parse(c.cursor) as { url?:string; after?:string; before?:string } : {};
  const after = cursor.after || c.since; const before = cursor.before || new Date().toISOString();
  // /me/messages covers received folders, unlike inbox-only delta. Watermark windows
  // have a short overlap to catch provider delivery/indexing delays.
  const params = new URLSearchParams({ "$filter":`receivedDateTime ge ${after} and receivedDateTime lt ${before} and isDraft eq false`, "$select":"id,conversationId,subject,from,receivedDateTime,body,webLink,isDraft", "$orderby":"receivedDateTime desc", "$top":"3" });
  const page = await fetchJSON<{value:GraphMessage[];"@odata.nextLink"?:string}>(cursor.url || `https://graph.microsoft.com/v1.0/me/messages?${params}`, token);
  const messages = page.value.filter(m => m.from?.emailAddress.address.toLowerCase() !== c.email.toLowerCase()).map(m => ({ id:m.id,threadId:m.conversationId,subject:m.subject,sender:m.from?.emailAddress.name || "",senderEmail:m.from?.emailAddress.address || "", receivedAt:m.receivedDateTime,text:m.body?.contentType.toLowerCase() === "html" ? plainHTML(m.body.content) : m.body?.content || m.bodyPreview || "", messageUrl: m.webLink?.startsWith("https://outlook.") ? m.webLink : null }));
  const complete = !page["@odata.nextLink"];
  return { messages,complete,cursor:JSON.stringify(complete ? {after:new Date(Math.max(new Date(c.since).getTime(),new Date(before).getTime()-120000)).toISOString()} : {after,before,url:page["@odata.nextLink"]}) };
}

export function imapClient(provider:keyof typeof imapHosts, email:string, password:string) {
  return new ImapFlow({ host:imapHosts[provider],port:993,secure:true,auth:{user:email,pass:password},logger:false,connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,tls:{minVersion:"TLSv1.2",rejectUnauthorized:true} });
}
export async function verifyImap(provider:keyof typeof imapHosts,email:string,password:string) {
  const client = imapClient(provider,email,password);
  try { await client.connect(); const lock = await client.getMailboxLock("INBOX",{readOnly:true}); lock.release(); }
  catch { throw new AppError("The mailbox couldn't be opened. Check your email and app-specific password.",400); }
  finally { client.close(); }
}
export async function imapPage(c:ConnectionSecret,id:string):Promise<MailPage> {
  const provider = c.provider as keyof typeof imapHosts;
  if (!imapHosts[provider]) throw new AppError("Unsupported email provider.");
  const client = imapClient(provider,c.email,decrypted(c.secret,tokenContext(c.uid,id)));
  try {
    await client.connect(); const lock = await client.getMailboxLock("INBOX",{readOnly:true});
    try {
      const validity = client.mailbox ? String(client.mailbox.uidValidity) : "";
      const state = c.cursor ? JSON.parse(c.cursor) as {uid:number;validity:string} : {uid:0,validity};
      const lastUid = state.validity === validity ? state.uid : 0;
      const found = await client.search({ since:new Date(c.since), ...(lastUid ? {uid:`${lastUid+1}:*`} : {}) },{uid:true});
      const ids = (found || []).filter(uid => uid > lastUid).sort((a,b)=>a-b).slice(0,3);
      const messages:MailInput[] = [];
      let checkpoint = lastUid;
      for (const uid of ids) {
        const msg = await client.fetchOne(uid,{source:{start:0,maxLength:131072},internalDate:true},{uid:true});
        if (!msg) { checkpoint=uid; continue; }
        const parsed = await parseEML(msg.source || Buffer.alloc(0));
        checkpoint=uid;
        const date = msg.internalDate ? new Date(msg.internalDate).toISOString() : parsed.receivedAt;
        if (date < c.since) continue;
        messages.push({...parsed,id:`${validity}:${uid}`,receivedAt:date});
      }
      return {messages,complete:(found || []).filter(uid=>uid>lastUid).length <=3,cursor:JSON.stringify({uid:checkpoint,validity})};
    } finally { lock.release(); }
  } catch(error) { if (error instanceof AppError) throw error; throw new AppError("This mailbox could not be reached. Check its app password or try again later.",503); }
  finally { client.close(); }
}
export async function parseEML(source:Buffer):Promise<MailInput> {
  const parsed = await simpleParser(source,{skipHtmlToText:false,skipTextToHtml:true,skipImageLinks:true});
  const sender=parsed.from?.value[0];
  const messageId = parsed.messageId || hash(source.toString("base64"));
  const references = parsed.references ? (Array.isArray(parsed.references) ? parsed.references : [parsed.references]) : [];
  return {id:hash(messageId),threadId:hash(references[0] || parsed.inReplyTo || messageId),subject:parsed.subject || "No subject",sender:sender?.name || sender?.address || "Unknown sender",senderEmail:sender?.address || "",receivedAt:(parsed.date || new Date()).toISOString(),text:parsed.text || (parsed.html ? plainHTML(parsed.html) : ""),messageUrl:null};
}
