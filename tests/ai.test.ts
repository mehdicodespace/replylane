import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { memoryDB } from "./helpers/memory-db";
const mocks = vi.hoisted(() => ({ database: null as any }));
vi.mock("@/lib/server/core", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/server/core")>();
  return {
    ...real,
    db: () => mocks.database.db,
    userRef: (uid: string) => mocks.database.doc(`users/${uid}`),
    env: (name: string) => (name === "GROQ_API_KEY" ? "test-api-key" : process.env[name] || ""),
  };
});
import { classify, classifyBatch, prepareInput, reserveBudget } from "@/lib/server/ai";
const mail = {
  id: "m1",
  threadId: "t1",
  subject: "Interview invitation",
  sender: "Jane <jane@example.com>",
  senderEmail: "jane@example.com",
  receivedAt: "2026-10-21T13:00:00.000Z",
  text: "Meet us at https://example.com/private-token . Contact jane@example.com",
  messageUrl: null,
};
const classification = {
  relevant: true,
  relevanceConfidence: 0.98,
  status: "interview",
  confidence: 0.96,
  company: "Example",
  role: "Engineer",
  language: "en",
  summary: "Invited to an interview.",
  nextAction: "Choose a time",
  deadline: null,
};
beforeEach(() => {
  mocks.database = memoryDB();
  mocks.database.state.set("users/alice", {});
  mocks.database.state.set("users/bob", {});
  vi.stubEnv("AI_DAILY_REQUEST_BUDGET", "500");
  vi.stubEnv("AI_DAILY_TOKEN_BUDGET", "150000");
  vi.stubEnv("AI_MIN_INTERVAL_MS", "0");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("hosted AI contract and allowance", () => {
  it("matches batched results by validated index even when returned out of order", async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json(
        {
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify({
                  results: [
                    { index: 1, classification: { ...classification, company: "Second" } },
                    { index: 0, classification },
                  ],
                }),
              },
            },
          ],
          usage: { total_tokens: 1000 },
        },
        { headers: { "x-ratelimit-limit-tokens": "8000" } },
      ),
    );
    vi.stubGlobal("fetch", fetch);
    const results = await classifyBatch([mail, { ...mail, id: "second" }], "alice");
    expect(results.map((r) => r.company)).toEqual(["Example", "Second"]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(mocks.database.state.get("system/aiThrottle").until).toBeGreaterThan(Date.now());
  });
  it.each([[0, 0], [0], [0, 2]])(
    "rejects incomplete or mismatched batch indexes %j",
    async (...indexes) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          Response.json({
            choices: [
              {
                finish_reason: "stop",
                message: {
                  content: JSON.stringify({
                    results: indexes.map((index) => ({ index, classification })),
                  }),
                },
              },
            ],
            usage: { total_tokens: 500 },
          }),
        ),
      );
      await expect(classifyBatch([mail, { ...mail, id: "second" }], "alice")).rejects.toThrow(
        "batch could not be verified",
      );
    },
  );
  it("redacts links and email addresses and bounds multilingual input bytes", () => {
    const input = prepareInput({ ...mail, text: mail.text + "م".repeat(10000) });
    expect(input).not.toContain("jane@example.com");
    expect(input).not.toContain("private-token");
    expect(input).toContain("[TRUNCATED]");
    expect(Buffer.byteLength(JSON.parse(input).text)).toBeLessThan(3650);
  });
  it("uses a server-side REST request with strict structured output", async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify(classification) } }],
        usage: { total_tokens: 600 },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    expect(await classify(mail, "alice")).toMatchObject({ status: "interview" });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer test-api-key");
    const body = JSON.parse(init.body);
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.messages[0].content).toContain("untrusted data");
    expect(body.tools).toBeUndefined();
    const usage = mocks.database.state.get(`aiUsage/${new Date().toISOString().slice(0, 10)}`);
    expect(usage.tokens).toBe(600);
  });
  it("rejects invalid output rather than inventing an outcome", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          choices: [{ finish_reason: "stop", message: { content: '{"status":"hired"}' } }],
        }),
      ),
    );
    await expect(classify(mail, "alice")).rejects.toThrow("could not be verified");
  });
  it("does not retry immediately on upstream 429", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response("limit", { status: 429, headers: { "retry-after": "60" } }));
    vi.stubGlobal("fetch", fetch);
    await expect(classify(mail, "alice")).rejects.toThrow("remains queued");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(mocks.database.state.get("system/aiThrottle").until).toBeGreaterThan(Date.now());
  });
  it("reserves the global allowance atomically across different users", async () => {
    vi.stubEnv("AI_DAILY_TOKEN_BUDGET", "1000");
    const reservations = await Promise.allSettled([
      reserveBudget("alice", 700),
      reserveBudget("bob", 700),
    ]);
    expect(reservations.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(reservations.filter((r) => r.status === "rejected")).toHaveLength(1);
  });
  it("applies a separate per-account daily import limit", async () => {
    const day = new Date().toISOString().slice(0, 10);
    mocks.database.state.set(`users/alice/usage/${day}`, { requests: 300, tokens: 1000 });
    await expect(reserveBudget("alice", 300)).rejects.toThrow("daily processing limit");
  });
});
