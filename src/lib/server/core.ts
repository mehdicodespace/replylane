import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function env(name: string) {
  const value = process.env[name];
  if (!value) throw new AppError("This service has not been configured by the deployment owner yet.", 503);
  return value;
}
export function adminApp() {
  return getApps()[0] || initializeApp({ credential: cert({
    projectId: env("FIREBASE_PROJECT_ID"), clientEmail: env("FIREBASE_CLIENT_EMAIL"), privateKey: env("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n"),
  }) });
}
export const db = () => getFirestore(adminApp());
export const adminAuth = () => getAuth(adminApp());
export function appURL() { return env("APP_URL").replace(/\/$/, ""); }
export async function authenticate(request: Request, recent = false) {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) throw new AppError("Please sign in to continue.", 401);
  let decoded;
  try { decoded = await adminAuth().verifyIdToken(header.slice(7), true); }
  catch { throw new AppError("Your session has expired. Please sign in again.", 401); }
  if (!decoded.email_verified) throw new AppError("Verify your email address before connecting an inbox.", 403);
  if (recent && Date.now() / 1000 - decoded.auth_time > 300) throw new AppError("Please sign out and sign in again before deleting your account.", 403);
  return decoded.uid;
}
export function requireProcessing() {
  if (process.env.MAIL_PROCESSING_ENABLED !== "true") throw new AppError("Live email processing is not enabled on this deployment. The demo is available while the owner finishes setup.", 503);
  env("GROQ_API_KEY");
}
export function encrypted(value: string, context: string) {
  const key = Buffer.from(env("TOKEN_ENCRYPTION_KEY"), "base64");
  if (key.length !== 32) throw new AppError("The server encryption key is not configured correctly.", 503);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map(b => b.toString("base64url")).join(".");
}
export function decrypted(value: string, context: string) {
  const [iv, tag, ciphertext] = value.split(".").map(v => Buffer.from(v, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(env("TOKEN_ENCRYPTION_KEY"), "base64"), iv);
  decipher.setAAD(Buffer.from(context)); decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
export const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const userRef = (uid: string) => db().collection("users").doc(uid);
export function responseError(error: unknown) {
  if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError) return NextResponse.json({ error: "Please check the supplied details." }, { status: 400 });
  // Never log email content, credentials, provider bodies, or raw upstream exceptions.
  console.error("Replylane request failed", { type: error instanceof Error ? error.name : "UnknownError" });
  return NextResponse.json({ error: "The service couldn't finish this request. Please try again shortly." }, { status: 500 });
}
export async function jsonBody(request: Request, maxBytes = 20000) {
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("Request body is required.");
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new AppError("This request is too large.", 413); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new AppError("Please send valid JSON."); }
}
export async function rateLimit(uid: string, action: string, seconds = 10) {
  const ref = db().collection("rateLimits").doc(hash(`${uid}:${action}`));
  await db().runTransaction(async tx => {
    const snap = await tx.get(ref);
    if ((snap.data()?.until || 0) > Date.now()) throw new AppError("Please wait a moment before trying again.", 429);
    tx.set(ref, { until: Date.now() + seconds * 1000 });
  });
}
