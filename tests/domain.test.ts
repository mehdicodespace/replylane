import { describe, it, expect } from "vitest";
import {
  safeClassification,
  filterApplications,
  csvExport,
  applicationPatchSchema,
  assessmentStageStatus,
  lanes,
  statusLabels,
} from "@/lib/domain";
import { createDemoApplications } from "@/lib/demo";
import { workspacePath } from "@/lib/workspace-navigation";
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
  it("treats Persian initial assessment as a next step, while preserving manual and later outcomes", () => {
    expect(assessmentStageStatus("در لیست ارزیابی اولیه قرار گرفتید", "received")).toBe(
      "next_step",
    );
    expect(assessmentStageStatus("Invitation to interview", "interview")).toBe("interview");
    expect(assessmentStageStatus("ارزیابی اولیه", "received", true)).toBe("received");
  });
  it("treats an explicit resume-viewed notice as received instead of needs review", () => {
    const viewed =
      "رزومه شما برای موقعیت شغلی AI Vibe Coder توسط شرکت کانون تبلیغاتی ایران نوین مشاهده شد.";
    expect(assessmentStageStatus(viewed, "review")).toBe("received");
    expect(
      assessmentStageStatus(`${viewed} شما به مرحله ارزیابی اولیه دعوت شده‌اید.`, "review"),
    ).toBe("next_step");
    expect(assessmentStageStatus(`${viewed} برای مصاحبه با ما تماس بگیرید.`, "review")).toBe(
      "review",
    );
    expect(assessmentStageStatus(viewed, "review", true)).toBe("review");
  });
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
  it("searches European company names and German replies", () => {
    expect(filterApplications(items, { ...filters, search: "Revolut" })).toHaveLength(1);
    expect(filterApplications(items, { ...filters, search: "Bewerbung" }).length).toBeGreaterThan(
      0,
    );
  });
  it("combines language, status, date and mailbox filters", () => {
    const a = items[2];
    expect(
      filterApplications(items, {
        ...filters,
        language: "en",
        status: "interview",
        dateFrom: a.receivedAt.slice(0, 10),
        dateTo: a.receivedAt.slice(0, 10),
        connectionId: a.connectionId,
      }),
    ).toEqual([a]);
  });
  it("separates archived items and saved items", () => {
    const changed = items.map((a, i) => ({ ...a, archived: i === 0 }));
    expect(filterApplications(changed, filters)).toHaveLength(
      items.filter((a) => a.id !== items[0].id).length,
    );
    expect(filterApplications(changed, { ...filters, tab: "archive" })).toHaveLength(1);
    expect(
      filterApplications(changed, { ...filters, tab: "starred" }).every(
        (a) => a.starred && !a.archived,
      ),
    ).toBe(true);
  });
  it("keeps trashed applications out of regular and archived views", () => {
    const changed = items.map((application, index) => ({
      ...application,
      trashed: index === 0,
    }));
    expect(filterApplications(changed, filters)).toHaveLength(
      items.filter((a) => a.id !== items[0].id).length,
    );
    expect(filterApplications(changed, { ...filters, tab: "trash" })).toHaveLength(1);
    expect(workspacePath("applications", "trash")).toBe("/app/trash");
  });
  it("keeps acknowledgments off the board and gives rejected replies their own tab", () => {
    expect(lanes.some((lane) => lane.id === "received")).toBe(false);
    expect(lanes.find((lane) => lane.id === "rejected")?.label).toBe("Rejected");
    expect(statusLabels.rejected).toBe("Rejected");
    expect(workspacePath("applications", "rejected")).toBe("/app/rejected");
    const rejected = filterApplications(items, { ...filters, tab: "rejected" });
    expect(rejected.length).toBeGreaterThan(0);
    expect(rejected.every((application) => application.status === "rejected")).toBe(true);
    const attention = filterApplications(items, { ...filters, tab: "attention" });
    expect(
      attention.every(
        (application) =>
          application.status !== "received" &&
          application.status !== "review" &&
          application.status !== "rejected",
      ),
    ).toBe(true);
  });
  it("shows needs-review replies in the full overview and on their own route", () => {
    const reviewItems = items.filter((application) => application.status === "review");
    expect(reviewItems.length).toBeGreaterThan(0);
    expect(
      filterApplications(items, filters).some((application) => application.status === "review"),
    ).toBe(true);
    expect(filterApplications(items, { ...filters, tab: "review" })).toEqual(reviewItems);
    expect(workspacePath("applications", "review")).toBe("/app/review");
    expect(lanes.map((lane) => lane.label)).toEqual(["Moving forward", "Offers", "Rejected"]);
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
