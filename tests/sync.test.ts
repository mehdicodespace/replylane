import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { memoryDB } from "./helpers/memory-db";
import type { Classification, MailInput } from "@/lib/domain";
import type { ConnectionSecret } from "@/lib/server/providers";

const mocks = vi.hoisted(() => ({
  database: null as any,
  classify: vi.fn(),
  classifyBatch: vi.fn(),
  gmailPage: vi.fn(),
  accessToken: vi.fn(),
}));
vi.mock("@/lib/server/core", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/server/core")>();
  return {
    ...real,
    db: () => mocks.database.db,
    userRef: (uid: string) => mocks.database.doc(`users/${uid}`),
  };
});
vi.mock("@/lib/server/ai", () => ({
  classify: mocks.classify,
  classifyBatch: mocks.classifyBatch,
  PROMPT_VERSION: "test",
}));
vi.mock("@/lib/server/providers", () => ({
  accessToken: mocks.accessToken,
  gmailPage: mocks.gmailPage,
  microsoftPage: vi.fn(),
  imapPage: vi.fn(),
}));
import { recordMail, syncConnection, scheduledSync } from "@/lib/server/sync";
import { AppError, hash } from "@/lib/server/core";
import { requestHistoryImport } from "@/lib/server/history";
const result: Classification = {
  relevant: true,
  relevanceConfidence: 0.99,
  status: "interview",
  confidence: 0.95,
  company: "Example",
  role: "Frontend Engineer",
  language: "en",
  summary: "Interview invitation",
  nextAction: "Choose a time",
  deadline: null,
};
const mail = (id: string, receivedAt = "2026-10-21T13:00:00.000Z"): MailInput => ({
  id,
  threadId: "thread1",
  subject: "Interview",
  sender: "Recruiter",
  senderEmail: "jobs@example.com",
  receivedAt,
  text: "We would like to meet you.",
  messageUrl: null,
});
const connection: ConnectionSecret = {
  uid: "alice",
  provider: "google",
  email: "alice@example.com",
  secret: "ciphertext",
  createdAt: "2026-10-21T12:00:00.000Z",
  since: "2026-10-21T12:00:00.000Z",
  cursor: null,
  liveCursor: null,
  lastPhase: "import",
  importComplete: true,
  processed: 0,
  lastSyncAt: null,
  nextSyncAt: 0,
  status: "connected",
  error: null,
  lockUntil: 0,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.database = memoryDB();
  mocks.database.state.set("users/alice", {});
  mocks.database.state.set("connections/c1", structuredClone(connection));
  mocks.classify.mockResolvedValue(result);
  mocks.classifyBatch.mockImplementation(async (mails: MailInput[]) => mails.map(() => result));
  mocks.accessToken.mockResolvedValue({ access: "access", rotated: null });
});
describe("durable mail processing", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("starts a bounded import without resetting the new-mail cursor or existing results", async () => {
    Object.assign(mocks.database.state.get("connections/c1"), {
      liveCursor: "live-position",
      importChecked: 8,
      importMatched: 5,
    });
    mocks.database.state.set("users/alice/applications/kept", { notes: "Keep this" });
    const before = Date.now();
    await requestHistoryImport("c1", "alice", 60);
    const c = mocks.database.state.get("connections/c1");
    expect(c).toMatchObject({
      createdAt: connection.createdAt,
      liveCursor: "live-position",
      cursor: null,
      importComplete: false,
      importDays: 60,
      importChecked: 8,
      importMatched: 5,
      lastPhase: "live",
    });
    expect(new Date(c.since).getTime()).toBeGreaterThanOrEqual(before - 60 * 86400000);
    expect(new Date(c.since).getTime()).toBeLessThanOrEqual(Date.now() - 60 * 86400000);
    expect(mocks.database.state.get("users/alice/applications/kept").notes).toBe("Keep this");
    await expect(requestHistoryImport("c1", "alice", 30)).rejects.toThrow("already in progress");
  });
  it("refuses history changes for other users, paused inboxes, deleted accounts and active leases", async () => {
    await expect(requestHistoryImport("c1", "bob", 60)).rejects.toThrow("Mailbox not found");
    Object.assign(mocks.database.state.get("connections/c1"), { status: "paused" });
    await expect(requestHistoryImport("c1", "alice", 60)).rejects.toThrow("Resume or reconnect");
    Object.assign(mocks.database.state.get("connections/c1"), {
      status: "connected",
      lockUntil: Date.now() + 60000,
    });
    await expect(requestHistoryImport("c1", "alice", 60)).rejects.toThrow("sync is running");
    mocks.database.state.set("users/alice", { deleting: true });
    await expect(requestHistoryImport("c1", "alice", 60)).rejects.toThrow("Account unavailable");
  });
  it("reports import progress without counting an already processed email twice", async () => {
    Object.assign(mocks.database.state.get("connections/c1"), {
      since: "2026-09-01T00:00:00.000Z",
      importComplete: false,
      lastPhase: "live",
      liveCursor: "keep-live",
      importChecked: 0,
      importMatched: 0,
    });
    mocks.gmailPage.mockResolvedValue({
      messages: [mail("older", "2026-10-01T10:00:00.000Z")],
      cursor: "history-page",
      complete: false,
    });
    await syncConnection("c1", "alice");
    expect(mocks.database.state.get("connections/c1")).toMatchObject({
      importChecked: 1,
      importMatched: 1,
      liveCursor: "keep-live",
      cursor: "history-page",
    });
    Object.assign(mocks.database.state.get("connections/c1"), { nextSyncAt: 0, lastPhase: "live" });
    await syncConnection("c1", "alice");
    expect(mocks.classify).toHaveBeenCalledTimes(1);
    expect(mocks.database.state.get("connections/c1").importChecked).toBe(1);
  });
  it("continues other users when one user has spent their daily allowance", async () => {
    vi.stubEnv("MAIL_PROCESSING_ENABLED", "true");
    mocks.database.state.set("users/bob", {});
    Object.assign(mocks.database.state.get("connections/c1"), { nextSyncAt: -2 });
    mocks.database.state.set("connections/c2", {
      ...connection,
      uid: "bob",
      email: "bob@example.com",
      nextSyncAt: -1,
    });
    mocks.gmailPage.mockResolvedValue({ messages: [mail("m1")], cursor: "done", complete: true });
    mocks.classify
      .mockRejectedValueOnce(new AppError("Personal daily allowance", 429, "PERSONAL_BUDGET"))
      .mockResolvedValueOnce(result);
    expect(await scheduledSync(1)).toEqual({ processed: 1 });
    expect(mocks.classify).toHaveBeenCalledTimes(2);
  });
  it("preserves a pause made while inference was in flight", async () => {
    mocks.gmailPage.mockResolvedValue({ messages: [mail("m1")], cursor: "done", complete: true });
    mocks.classify.mockImplementationOnce(async () => {
      Object.assign(mocks.database.state.get("connections/c1"), {
        status: "paused",
        nextSyncAt: Number.MAX_SAFE_INTEGER,
      });
      return result;
    });
    await expect(syncConnection("c1", "alice")).rejects.toThrow("no longer active");
    expect(mocks.database.state.get("connections/c1")).toMatchObject({
      status: "paused",
      nextSyncAt: Number.MAX_SAFE_INTEGER,
      lockUntil: 0,
    });
  });
  it("records a result and history exactly once for a repeated delivery", async () => {
    await recordMail("alice", "c1", mail("m1"), result, "import");
    await recordMail("alice", "c1", mail("m1"), result, "import");
    expect(mocks.database.state.get("connections/c1").processed).toBe(0);
    expect(
      [...mocks.database.state.entries()].find(([key]) => key.includes("/receipts/"))?.[1],
    ).toMatchObject({ counted: false, phase: "import" });
    expect(
      [...mocks.database.state.keys()].filter((k: string) => k.includes("/receipts/")),
    ).toHaveLength(1);
    expect(
      [...mocks.database.state.keys()].filter((k: string) => k.includes("/events/")),
    ).toHaveLength(1);
  });
  it("keeps older imports from replacing a newer interview", async () => {
    await recordMail("alice", "c1", mail("new"), result);
    await recordMail("alice", "c1", mail("old", "2026-10-01T10:00:00.000Z"), {
      ...result,
      status: "received",
      summary: "Received",
    });
    const app = mocks.database.state.get(`users/alice/applications/${hash("c1:thread1")}`);
    expect(app.status).toBe("interview");
    expect(app.summary).toBe("Interview invitation");
    expect(
      [...mocks.database.state.keys()].filter((k: string) => k.includes("/events/")),
    ).toHaveLength(2);
  });
  it("preserves manual status, notes, saved state and deadline on new mail", async () => {
    await recordMail("alice", "c1", mail("m1"), result);
    const key = `users/alice/applications/${hash("c1:thread1")}`;
    Object.assign(mocks.database.state.get(key), {
      manualStatus: true,
      status: "next_step",
      notes: "Ask about remote work",
      starred: true,
      deadline: "2026-10-28",
    });
    await recordMail("alice", "c1", mail("m2", "2026-10-22T10:00:00.000Z"), {
      ...result,
      status: "offer",
    });
    expect(mocks.database.state.get(key)).toMatchObject({
      status: "next_step",
      aiStatus: "offer",
      notes: "Ask about remote work",
      starred: true,
      deadline: "2026-10-28",
    });
  });
  it("does not persist irrelevant message content", async () => {
    await recordMail("alice", "c1", mail("unrelated"), { ...result, relevant: false });
    const values = JSON.stringify([...mocks.database.state.values()]);
    expect(values).not.toContain("We would like to meet you");
    expect(values).not.toContain("Interview invitation");
    expect(
      [...mocks.database.state.keys()].filter((k: string) => k.includes("/applications/")),
    ).toHaveLength(0);
  });
  it("doesn't recreate data after disconnect or account deletion", async () => {
    mocks.database.state.delete("connections/c1");
    await expect(recordMail("alice", "c1", mail("m1"), result)).rejects.toThrow("no longer active");
    mocks.database.state.set("connections/c1", connection);
    mocks.database.state.set("users/alice", { deleting: true });
    await expect(recordMail("alice", "c1", mail("m1"), result)).rejects.toThrow("no longer active");
  });
  it("keeps the cursor on a partially processed page and skips receipts on retry", async () => {
    mocks.gmailPage.mockResolvedValue({
      messages: Array.from({ length: 7 }, (_, i) => mail(`m${i + 1}`)),
      cursor: "next-page",
      complete: false,
    });
    await syncConnection("c1", "alice");
    expect(mocks.database.state.get("connections/c1").liveCursor).toBeNull();
    Object.assign(mocks.database.state.get("connections/c1"), { nextSyncAt: 0 });
    await syncConnection("c1", "alice");
    expect(mocks.classifyBatch).toHaveBeenCalledTimes(1);
    expect(mocks.classify).toHaveBeenCalledTimes(1);
    expect(mocks.database.state.get("connections/c1").liveCursor).toBe("next-page");
  });
  it("retains work on an AI rate limit and releases the lease", async () => {
    mocks.gmailPage.mockResolvedValue({ messages: [mail("m1")], cursor: "next", complete: true });
    mocks.classify.mockRejectedValue(new AppError("AI provider limit", 429));
    await expect(syncConnection("c1", "alice")).rejects.toThrow("AI provider limit");
    expect(mocks.database.state.get("connections/c1")).toMatchObject({
      liveCursor: null,
      lockUntil: 0,
      error: "AI provider limit",
    });
    expect([...mocks.database.state.keys()].some((k: string) => k.includes("/receipts/"))).toBe(
      false,
    );
  });
  it("excludes emails predating the new-mail boundary", async () => {
    mocks.gmailPage.mockResolvedValue({
      messages: [mail("old", "2026-10-21T11:59:59.000Z"), mail("new")],
      cursor: "done",
      complete: true,
    });
    await syncConnection("c1", "alice");
    expect(mocks.classify).toHaveBeenCalledTimes(1);
    expect(mocks.classify.mock.calls[0][0].id).toBe("new");
  });
  it("alternates incoming and history cursors while importing", async () => {
    Object.assign(mocks.database.state.get("connections/c1"), {
      since: "2026-09-21T12:00:00.000Z",
      importComplete: false,
      lastPhase: "import",
    });
    mocks.gmailPage.mockResolvedValue({ messages: [], cursor: '{"page":"live"}', complete: false });
    await syncConnection("c1", "alice");
    expect(mocks.gmailPage.mock.calls[0][0].since).toBe(connection.createdAt);
    Object.assign(mocks.database.state.get("connections/c1"), { nextSyncAt: 0 });
    mocks.gmailPage.mockResolvedValue({ messages: [], cursor: '{"page":"old"}', complete: false });
    await syncConnection("c1", "alice");
    expect(mocks.gmailPage.mock.calls[1][0]).toMatchObject({
      since: "2026-09-21T12:00:00.000Z",
      until: connection.createdAt,
    });
    expect(mocks.database.state.get("connections/c1").liveCursor).toBe('{"page":"live"}');
    expect(mocks.database.state.get("connections/c1").cursor).toBe('{"page":"old"}');
  });
  it("rejects access to another user's connection and overlapping work", async () => {
    await expect(syncConnection("c1", "bob")).rejects.toThrow("Mailbox not found");
    Object.assign(mocks.database.state.get("connections/c1"), { lockUntil: Date.now() + 100000 });
    await expect(syncConnection("c1", "alice")).rejects.toThrow("already syncing");
    expect(mocks.gmailPage).not.toHaveBeenCalled();
  });
  it("lets an explicit manual check run before the next scheduled time", async () => {
    Object.assign(mocks.database.state.get("connections/c1"), {
      lastSyncAt: new Date().toISOString(),
      nextSyncAt: Date.now() + 10 * 60000,
    });
    mocks.gmailPage.mockResolvedValue({ messages: [], cursor: null, complete: true });
    await expect(syncConnection("c1", "alice")).rejects.toThrow("next sync is queued");
    await expect(syncConnection("c1", "alice", true)).resolves.toMatchObject({ processed: 0 });
    expect(mocks.gmailPage).toHaveBeenCalledTimes(1);
  });
});
