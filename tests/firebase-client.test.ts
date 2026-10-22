import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { auth, signOut } = vi.hoisted(() => ({
  auth: { currentUser: { getIdToken: vi.fn() } },
  signOut: vi.fn(),
}));

vi.mock("firebase/app", () => ({ getApps: () => [{}], initializeApp: vi.fn() }));
vi.mock("firebase/auth", () => ({ getAuth: () => auth, signOut }));

describe("authenticated API session handling", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "test-api-key");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "test-project");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "test.example");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_APP_ID", "test-app-id");
    auth.currentUser.getIdToken.mockResolvedValue("expired-token");
    signOut.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("signs the user out when the server rejects an expired session", async () => {
    vi.resetModules();
    const { api } = await import("@/lib/firebase-client");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Your session has expired. Please sign in again." }), {
          status: 401,
        }),
      ),
    );

    await expect(api("/api/workspace")).rejects.toThrow(
      "Your session has expired. Please sign in again.",
    );
    expect(signOut).toHaveBeenCalledWith(auth);
  });

  it("signs the user out when Firebase cannot refresh the session token", async () => {
    vi.resetModules();
    const { api } = await import("@/lib/firebase-client");
    auth.currentUser.getIdToken.mockRejectedValue(
      Object.assign(new Error("Refresh token expired"), { code: "auth/user-token-expired" }),
    );

    await expect(api("/api/workspace")).rejects.toThrow(
      "Your session has expired. Please sign in again.",
    );
    expect(signOut).toHaveBeenCalledWith(auth);
  });
});
