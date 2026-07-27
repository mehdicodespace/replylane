import { describe, it, expect } from "vitest";
import {
  safeClassification,
  filterApplications,
  csvExport,
  applicationPatchSchema,
} from "@/lib/domain";
import { createDemoApplications } from "@/lib/demo";
const base = {
  relevant: true,
  relevanceConfidence: 0.99,
  status: "interview",
  confidence: 0.96,
  company: "Example",
  role: "Engineer",
  language: "en",
  summary: "Interview invitation",
  nextAction: "Choose a time",
  deadline: null,
};
const filters = {
  search: "",
  status: "all",
  language: "all",
  sort: "newest",
  tab: "all",
  dateFrom: "",
  dateTo: "",
};
describe("classification boundary", () => {
  it("routes low-confidence outcomes to review", () =>
    expect(safeClassification({ ...base, confidence: 0.5 }).status).toBe("review"));
  it("retains uncertain relevance for human review", () =>
    expect(
      safeClassification({ ...base, relevant: false, relevanceConfidence: 0.6 }),
    ).toMatchObject({ relevant: true, status: "review" }));
  it("excludes confident unrelated results", () =>
    expect(safeClassification({ ...base, relevant: false }).relevant).toBe(false));
  it("rejects provider-invented statuses and extra fields", () => {
    expect(() => safeClassification({ ...base, status: "hired" })).toThrow();
    expect(() => safeClassification({ ...base, command: "send-mail" })).toThrow();
  });
  it("does not retain invented datetime deadlines", () =>
    expect(safeClassification({ ...base, deadline: "tomorrow at 3" }).deadline).toBeNull());
  it("limits user edits to the intended fields", () => {
    expect(
      applicationPatchSchema.safeParse({ company: "Injected", connectionId: "other-user" }).success,
    ).toBe(false);
    expect(
      applicationPatchSchema.safeParse({ notes: "Interview preparation", status: "offer" }).success,
    ).toBe(true);
  });
});
describe("search and export", () => {
  const items = createDemoApplications();
  it("searches Persian company names and German replies", () => {
    expect(filterApplications(items, { ...filters, search: "تپسی" })).toHaveLength(1);
    expect(filterApplications(items, { ...filters, search: "Bewerbung" }).length).toBeGreaterThan(
      0,
    );
  });
  it("combines language, status, date and mailbox filters", () => {
    const a = items[2];
    expect(
      filterApplications(items, {
        ...filters,
        language: "fa",
        status: "interview",
        dateFrom: a.receivedAt.slice(0, 10),
        dateTo: a.receivedAt.slice(0, 10),
        connectionId: a.connectionId,
      }),
    ).toEqual([a]);
  });
  it("separates archived items and saved items", () => {
    const changed = items.map((a, i) => ({ ...a, archived: i === 0 }));
    expect(filterApplications(changed, filters)).toHaveLength(items.length - 1);
    expect(filterApplications(changed, { ...filters, tab: "archive" })).toHaveLength(1);
    expect(
      filterApplications(changed, { ...filters, tab: "starred" }).every(
        (a) => a.starred && !a.archived,
      ),
    ).toBe(true);
  });
  it("sorts oldest first and missing deadlines last", () => {
    const byDate = filterApplications(items, { ...filters, sort: "oldest" });
    expect(byDate[0].receivedAt <= byDate.at(-1)!.receivedAt).toBe(true);
    expect(filterApplications(items, { ...filters, sort: "deadline" }).at(-1)!.deadline).toBeNull();
  });
  it("escapes CSV quotes, newlines, Unicode and spreadsheet formulas", () => {
    const csv = csvExport([
      { ...items[0], company: '=HYPERLINK("evil")', notes: 'line 1\nline "2"', role: "\t +danger" },
    ]);
    expect(csv).toContain('"\'=HYPERLINK(""evil"")"');
    expect(csv).toContain('"\'\t +danger"');
    expect(csv).toContain('line ""2""');
    expect(csv.startsWith("\uFEFF")).toBe(true);
  });
});
