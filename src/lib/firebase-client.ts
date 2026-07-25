"use client";
import { getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

export const firebaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
  process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
);
export function clientAuth() {
  if (!firebaseConfigured)
    throw new Error(
      "Account sign-in isn't configured on this deployment yet. You can explore the demo.",
    );
  const app =
    getApps()[0] ||
    initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    });
  return getAuth(app);
}
export async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = await clientAuth().currentUser?.getIdToken();
  if (!token) throw new Error("Please sign in to continue.");
  const result = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });
  const body = await result.json();
  if (!result.ok) throw new Error(body.error || "That didn't work. Please try again.");
  return body as T;
}
