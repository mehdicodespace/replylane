import { z } from "zod";

export const statuses = [
  "received",
  "interview",
  "next_step",
  "offer",
  "rejected",
  "review",
] as const;
export type Status = (typeof statuses)[number];
export const statusLabels: Record<Status, string> = {
  received: "Received",
  interview: "Interview",
  next_step: "Next step",
  offer: "Offer",
  rejected: "Not this time",
  review: "Needs review",
};
export const lanes: { id: string; label: string; statuses: Status[]; caption: string }[] = [
  { id: "received", label: "Received", statuses: ["received"], caption: "You're on their radar" },
  {
    id: "progress",
    label: "Moving forward",
    statuses: ["interview", "next_step"],
    caption: "Your next opportunity",
  },
  { id: "offer", label: "Offers", statuses: ["offer"], caption: "Something to celebrate" },
  {
    id: "rejected",
    label: "Not this time",
    statuses: ["rejected"],
    caption: "On to the right fit",
  },
  { id: "review", label: "Needs review", statuses: ["review"], caption: "A little human judgment" },
];

export interface Application {
  id: string;
  company: string;
  role: string;
  sender: string;
  senderEmail: string;
  subject: string;
  summary: string;
  excerpt: string;
  status: Status;
  aiStatus: Status;
  confidence: number;
  language: string;
  receivedAt: string;
  nextAction: string;
  deadline: string | null;
  starred: boolean;
  archived: boolean;
  notes: string;
  manualStatus: boolean;
  connectionId: string;
  provider: string;
  messageUrl: string | null;
  color?: string;
}
export interface MailEvent {
  id: string;
  subject: string;
  summary: string;
  status: Status;
  receivedAt: string;
  excerpt: string;
}
export interface Connection {
  id: string;
  provider: string;
  email: string;
  status: "connected" | "paused" | "error";
  lastSyncAt: string | null;
  processed: number;
  importComplete: boolean;
  error: string | null;
}
export const applicationPatchSchema = z
  .object({
    status: z.enum(statuses).optional(),
    starred: z.boolean().optional(),
    archived: z.boolean().optional(),
    notes: z.string().max(5000).optional(),
    deadline: z.union([z.iso.date(), z.null()]).optional(),
  })
  .strict();
export type ApplicationPatch = z.infer<typeof applicationPatchSchema>;

export const classificationSchema = z
  .object({
    relevant: z.boolean(),
    relevanceConfidence: z.number().min(0).max(1),
    status: z.enum(statuses),
    confidence: z.number().min(0).max(1),
    company: z.string().max(160),
    role: z.string().max(200),
    language: z.string().max(30),
    summary: z.string().max(700),
    nextAction: z.string().max(400),
    deadline: z.string().nullable(),
  })
  .strict();
export type Classification = z.infer<typeof classificationSchema>;
export interface MailInput {
  id: string;
  threadId: string;
  subject: string;
  sender: string;
  senderEmail: string;
  receivedAt: string;
  text: string;
  messageUrl: string | null;
}

export function safeClassification(input: unknown): Classification {
  const result = classificationSchema.parse(input);
  if (result.confidence < 0.82 || result.relevanceConfidence < 0.85) result.status = "review";
  if (result.deadline && !z.iso.date().safeParse(result.deadline).success) result.deadline = null;
  // An uncertain relevance decision must remain visible for review.
  if (!result.relevant && result.relevanceConfidence < 0.85) result.relevant = true;
  return result;
}
export interface Filters {
  search: string;
  status: string;
  language: string;
  sort: string;
  tab: string;
  dateFrom: string;
  dateTo: string;
  connectionId?: string;
}
export function filterApplications(items: Application[], f: Filters) {
  const needle = f.search.trim().normalize("NFKC").toLocaleLowerCase();
  return items
    .filter((a) => {
      if (f.tab === "archive" ? !a.archived : a.archived) return false;
      if (f.tab === "starred" && !a.starred) return false;
      if (
        f.tab === "attention" &&
        !["interview", "next_step", "offer", "review"].includes(a.status)
      )
        return false;
      if (f.status !== "all" && a.status !== f.status) return false;
      if (f.language !== "all" && a.language !== f.language) return false;
      if (f.connectionId && f.connectionId !== "all" && a.connectionId !== f.connectionId)
        return false;
      const received = new Date(a.receivedAt);
      const day = `${received.getFullYear()}-${String(received.getMonth() + 1).padStart(2, "0")}-${String(received.getDate()).padStart(2, "0")}`;
      if ((f.dateFrom && day < f.dateFrom) || (f.dateTo && day > f.dateTo)) return false;
      return (
        !needle ||
        [a.company, a.role, a.sender, a.senderEmail, a.subject, a.summary]
          .join(" ")
          .normalize("NFKC")
          .toLocaleLowerCase()
          .includes(needle)
      );
    })
    .sort((a, b) => {
      if (f.sort === "company") return a.company.localeCompare(b.company);
      if (f.sort === "confidence") return a.confidence - b.confidence;
      if (f.sort === "deadline") return (a.deadline || "9999").localeCompare(b.deadline || "9999");
      return f.sort === "oldest"
        ? a.receivedAt.localeCompare(b.receivedAt)
        : b.receivedAt.localeCompare(a.receivedAt);
    });
}
export function csvExport(items: Application[]) {
  const columns: (keyof Application)[] = [
    "company",
    "role",
    "status",
    "sender",
    "senderEmail",
    "receivedAt",
    "language",
    "summary",
    "nextAction",
    "deadline",
    "notes",
  ];
  const cell = (value: unknown) => {
    let s = String(value ?? "");
    // Spreadsheet formula injection protection includes leading whitespace/control characters.
    if (/^[\s\u0000-\u001f]*[=+@-]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return (
    "\uFEFF" +
    [columns, ...items.map((a) => columns.map((c) => a[c]))]
      .map((row) => row.map(cell).join(","))
      .join("\r\n")
  );
}
export function displayDate(date: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(
    new Date(date),
  );
}
