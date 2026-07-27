import { afterEach, describe, it, expect, vi } from "vitest";
import { encrypted, decrypted, jsonBody } from "@/lib/server/core";
import { randomBytes } from "node:crypto";
afterEach(() => vi.unstubAllEnvs());
describe("server secrets and payload boundaries", () => {
  it("binds encrypted credentials to their account and connection", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
    const cipher = encrypted("app-password", "mail:alice:inbox1");
    expect(cipher).not.toContain("app-password");
    expect(decrypted(cipher, "mail:alice:inbox1")).toBe("app-password");
    expect(() => decrypted(cipher, "mail:bob:inbox1")).toThrow();
    expect(encrypted("app-password", "mail:alice:inbox1")).not.toBe(cipher);
  });
  it("rejects oversized and malformed API bodies", async () => {
    await expect(
      jsonBody(
        new Request("http://localhost", {
          method: "POST",
          body: '{"notes":"' + "x".repeat(100) + '"}',
        }),
        30,
      ),
    ).rejects.toThrow("too large");
    await expect(
      jsonBody(new Request("http://localhost", { method: "POST", body: "{" })),
    ).rejects.toThrow("valid JSON");
  });
});
