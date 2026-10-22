"use client";
import { getApps, initializeApp } from "firebase/app";
import { getAuth, signOut } from "firebase/auth";

export const firebaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
  process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
);
export function clientAuth() {
  if (!firebaseConfigured)
    throw new Error(
      "Account sign-in isn't configured on this deployment yet. Please try again later.",
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
  const auth = clientAuth();
  let token: string | undefined;
  try {
    token = await auth.currentUser?.getIdToken();
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (
      ["auth/user-token-expired", "auth/invalid-user-token", "auth/user-disabled"].includes(
        code || "",
      )
    ) {
      await signOut(auth).catch(() => undefined);
      throw new Error("Your session has expired. Please sign in again.");
    }
    throw error;
  }
  if (!token) throw new Error("Please sign in to continue.");
  const result = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });
  const body = await result.json().catch(() => ({}));
  if (result.status === 401) {
    await signOut(auth).catch(() => undefined);
    throw new Error(body.error || "Your session has expired. Please sign in again.");
  }
  if (!result.ok) throw new Error(body.error || "That didn't work. Please try again.");
  return body as T;
}
