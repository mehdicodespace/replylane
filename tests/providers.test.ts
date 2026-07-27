import { afterEach, describe, it, expect, vi } from "vitest";
import {
  gmailPage,
  microsoftPage,
  parseEML,
  plainHTML,
  importRange,
  validMailHost,
  publicIP,
  type ConnectionSecret,
} from "@/lib/server/providers";
const c: ConnectionSecret = {
  uid: "user",
  provider: "google",
  email: "user@example.com",
  secret: "encrypted",
  createdAt: "2026-10-21T12:00:00.000Z",
  since: "2026-10-21T12:00:00.000Z",
  cursor: null,
  importComplete: true,
  processed: 0,
  lastSyncAt: null,
  nextSyncAt: 0,
  status: "connected",
  error: null,
  lockUntil: 0,
};
afterEach(() => vi.unstubAllGlobals());
describe("mail adapters", () => {
  it("supports only fresh, 30-day, and 60-day imports", () => {
    for (const d of [0, 30, 60]) expect(importRange.safeParse(d).success).toBe(true);
    for (const d of [90, 365, -1]) expect(importRange.safeParse(d).success).toBe(false);
  });
  it("decodes multipart Persian text without rendering HTML", async () => {
    const text = "از شما برای شرکت در مصاحبه دعوت می‌کنیم";
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ messages: [{ id: "m1" }], nextPageToken: "page-2" }))
      .mockResolvedValueOnce(
        Response.json({
          id: "m1",
          threadId: "thread1",
          internalDate: String(Date.parse("2026-10-21T13:00:00Z")),
          payload: {
            mimeType: "multipart/alternative",
            headers: [
              { name: "From", value: "Recruiter <jobs@example.com>" },
              { name: "Subject", value: "مصاحبه" },
            ],
            parts: [
              { mimeType: "text/plain", body: { data: Buffer.from(text).toString("base64url") } },
              {
                mimeType: "text/html",
                body: { data: Buffer.from("<b>Ignored</b>").toString("base64url") },
              },
            ],
          },
        }),
      );
    vi.stubGlobal("fetch", fetch);
    const page = await gmailPage(c, "access");
    expect(page.messages[0]).toMatchObject({
      text,
      senderEmail: "jobs@example.com",
      threadId: "thread1",
    });
    expect(page.complete).toBe(false);
    expect(JSON.parse(page.cursor).page).toBe("page-2");
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.searchParams.get("q")).toContain("after:1792584000");
    expect(url.searchParams.get("q")).not.toMatch(/application|interview/); // no English-only relevance gate
  });
  it("doesn't advance a page when the provider request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("error", { status: 503 })));
    await expect(gmailPage(c, "token")).rejects.toThrow("temporarily unavailable");
  });
  it("prevents a malicious Graph pagination URL from receiving a token", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      microsoftPage(
        {
          ...c,
          provider: "microsoft",
          cursor: JSON.stringify({ url: "https://evil.example/steal" }),
        },
        "secret",
      ),
    ).rejects.toThrow("Invalid mail pagination");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("parses email files and groups a reply by its reference", async () => {
    const mail = await parseEML(
      Buffer.from(
        "From: Jane <jobs@example.com>\r\nSubject: Your interview\r\nMessage-ID: <reply@example.com>\r\nReferences: <original@example.com>\r\nDate: Wed, 21 Oct 2026 13:00:00 +0000\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nWe would like to meet you.",
      ),
    );
    expect(mail.senderEmail).toBe("jobs@example.com");
    expect(mail.text).toContain("meet you");
    expect(mail.threadId).not.toBe(mail.id);
  });
  it("drops scripts, styles and HTML markup", () =>
    expect(
      plainHTML("<style>tracking</style><script>bad()</script><p>Hello<br>there &amp; welcome</p>"),
    ).toBe("Hello\nthere & welcome"));
});
describe("custom IMAP address validation", () => {
  it("accepts public DNS names", () =>
    expect(validMailHost(" IMAP.Example.com ")).toBe("imap.example.com"));
  it.each([
    "localhost",
    "127.0.0.1",
    "https://example.com",
    "mail.internal",
    "mail.local",
    "example.com:25",
    "example.com/path",
    "user@example.com",
  ])("blocks unsafe host %s", (host) => expect(() => validMailHost(host)).toThrow());
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "192.168.0.1",
    "172.16.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
    "0.0.0.0",
    "224.0.0.1",
  ])("blocks nonpublic address %s", (address) => expect(publicIP(address)).toBe(false));
  it("permits publicly routed addresses", () => {
    expect(publicIP("8.8.8.8")).toBe(true);
    expect(publicIP("2606:4700:4700::1111")).toBe(true);
  });
});
