"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Snackbar, Skeleton, Button } from "@mui/material";
import { signOut, sendEmailVerification } from "firebase/auth";
import {
  ArrowUpRight,
  LayoutGrid,
  List,
  Search,
  SlidersHorizontal,
  Star,
  Mail,
  Link2,
  Settings as SettingsIcon,
  ArrowRight,
  Archive,
  Menu,
  X,
  RefreshCw,
  Download,
  ChevronDown,
  Sparkles,
  CircleDot,
  Video,
  Gift,
  Inbox,
  ShieldCheck,
  LogOut,
  Check,
  CircleHelp,
} from "lucide-react";
import { Brand, ThemeToggle } from "./brand";
import { useAuth } from "./providers";
import { useDemo, useUI } from "@/lib/store";
import { demoConnections } from "@/lib/demo";
import { api, clientAuth } from "@/lib/firebase-client";
import {
  type Application,
  type ApplicationPatch,
  type Connection,
  filterApplications,
  csvExport,
  lanes,
  statuses,
  statusLabels,
  displayDate,
} from "@/lib/domain";
import { ApplicationDetail } from "./application-detail";
import { Connections } from "./connections";
import { Settings } from "./settings";

interface WorkspaceData {
  applications: Application[];
  connections: Connection[];
  usage: { requests: number; tokens: number };
  hasMore?: boolean;
}
export function Workspace({ demo = false }: { demo?: boolean }) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const demoState = useDemo();
  const { view, setView } = useUI();
  const [section, setSection] = useState("applications");
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [language, setLanguage] = useState("all");
  const [sort, setSort] = useState("newest");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [connectionId, setConnectionId] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [filters, setFilters] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [error, setError] = useState("");
  const [demoSync, setDemoSync] = useState(false);
  useEffect(() => {
    if (!demo && !authLoading && !user) router.replace("/sign-in");
  }, [demo, authLoading, user, router]);
  useEffect(() => {
    const s = params.get("section");
    if (s === "connections" || s === "settings") setSection(s);
    const c = params.get("connection");
    if (c)
      setNotice(
        c === "success"
          ? "Your inbox is connected. The first sync is queued."
          : c === "declined"
            ? "Mail access was declined. You can try connecting again."
            : "The connection couldn't finish. Try connecting your inbox again.",
      );
  }, [params]);
  const live = useQuery({
    queryKey: ["workspace", user?.uid],
    enabled: !demo && !!user?.emailVerified,
    queryFn: async () => {
      const initial = await api<WorkspaceData>("/api/workspace");
      if (initial.hasMore) {
        let cursor = initial.applications.at(-1)?.id;
        while (cursor) {
          const page = await api<{ applications: Application[]; cursor: string | null }>(
            `/api/applications?cursor=${cursor}`,
          );
          initial.applications.push(...page.applications);
          cursor = page.cursor || undefined;
        }
      }
      return initial;
    },
    refetchInterval: 30000,
  });
  const applications = demo ? demoState.applications : live.data?.applications || [];
  const connections = demo ? demoConnections : live.data?.connections || [];
  const active = applications.filter((a) => !a.archived);
  const mutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ApplicationPatch }) =>
      api(`/api/applications/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workspace"] }),
  });
  async function patch(id: string, p: ApplicationPatch) {
    if (demo) {
      demoState.patch(id, p);
      return;
    }
    await mutation.mutateAsync({ id, patch: p });
  }
  const filtered = useMemo(
    () =>
      filterApplications(applications, {
        search,
        status,
        language,
        sort,
        tab,
        dateFrom,
        dateTo,
        connectionId,
      }),
    [applications, search, status, language, sort, tab, dateFrom, dateTo, connectionId],
  );
  function go(s: string, t = "all") {
    setSection(s);
    setTab(t);
    setMobileNav(false);
  }
  function exportData(all = false) {
    const csv = csvExport(all ? applications : filtered);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `replylane-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setNotice(`${all ? applications.length : filtered.length} applications exported.`);
  }
  async function sync() {
    if (demo) {
      setDemoSync(true);
      setTimeout(() => {
        setDemoSync(false);
        setNotice(
          "Demo checked. These sample emails are already organized; no AI request was made.",
        );
      }, 700);
      return;
    }
    const c = connections.find((c) => c.status === "connected" && c.provider !== "import");
    if (!c) {
      go("connections");
      return;
    }
    setError("");
    try {
      await api("/api/mail/sync", { method: "POST", body: JSON.stringify({ id: c.id }) });
      await live.refetch();
      setNotice("Inbox checked. Queued messages continue as allowance becomes available.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function resetFilters() {
    setSearch("");
    setStatus("all");
    setLanguage("all");
    setDateFrom("");
    setDateTo("");
    setConnectionId("all");
  }
  const heading =
    tab === "starred"
      ? "A few worth keeping close"
      : tab === "archive"
        ? "A chapter, neatly closed"
        : "Your next chapter, in view";
  const nextSteps = active.filter((a) => ["interview", "next_step"].includes(a.status));
  const offers = active.filter((a) => a.status === "offer");
  const review = active.filter((a) => a.status === "review");
  if (!demo && (authLoading || !user))
    return (
      <div className="workspace-loading">
        <span className="brand-mark">
          <ArrowUpRight />
        </span>
        <p>Finding your workspace…</p>
      </div>
    );
  return (
    <div className="workspace">
      <a className="skip-link" href="#workspace-main">
        Skip to applications
      </a>
      {mobileNav && (
        <button
          className="nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          <Brand />
          <button
            className="icon-button sidebar-close"
            aria-label="Close navigation"
            onClick={() => setMobileNav(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="workspace-selector">
          <span className="workspace-avatar">
            {demo ? "M" : (user?.displayName || user?.email || "Y").slice(0, 1).toUpperCase()}
          </span>
          <div>
            <strong>
              {demo
                ? "Mehdi’s workspace"
                : `${user?.displayName?.split(" ")[0] || "Your"}${user?.displayName ? "’s" : ""} workspace`}
            </strong>
            <span>{demo ? "A preview of possibility" : "Your personal space"}</span>
          </div>
        </div>
        <span className="sidebar-label">YOUR WORKSPACE</span>
        <nav className="sidebar-nav" aria-label="Workspace navigation">
          <button
            onClick={() => go("applications")}
            className={
              section === "applications" && tab !== "starred" && tab !== "archive" ? "active" : ""
            }
          >
            <LayoutGrid size={18} />
            Applications<span className="nav-count">{active.length}</span>
          </button>
          <button
            onClick={() => go("applications", "starred")}
            className={section === "applications" && tab === "starred" ? "active" : ""}
          >
            <Star size={18} />
            Saved applications
          </button>
          <button
            onClick={() => go("connections")}
            className={section === "connections" ? "active" : ""}
          >
            <Link2 size={18} />
            Connected inboxes
            <span className="sidebar-live-dot" />
          </button>
          <button
            onClick={() => go("applications", "archive")}
            className={section === "applications" && tab === "archive" ? "active" : ""}
          >
            <Archive size={18} />
            Archive
          </button>
        </nav>
        <div className="sidebar-divider" />
        <nav className="sidebar-nav secondary">
          <button onClick={() => go("settings")} className={section === "settings" ? "active" : ""}>
            <SettingsIcon size={18} />
            Settings
          </button>
          <Link href="/privacy">
            <ShieldCheck size={18} />
            Privacy & your data
          </Link>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span>✳</span>
            <strong>A reply isn’t the whole story.</strong>
            <p>The right opportunity is still out there. Keep going.</p>
          </div>
          {demo ? (
            <Link href="/sign-up" className="sidebar-account">
              <span className="workspace-avatar">M</span>
              <div>
                <strong>Make this space yours</strong>
                <span>Create a free account</span>
              </div>
              <ArrowUpRight size={17} />
            </Link>
          ) : (
            <button
              className="sidebar-account"
              onClick={async () => {
                await signOut(clientAuth());
                queryClient.clear();
                router.push("/");
              }}
            >
              <span className="workspace-avatar">{(user?.displayName || "Y").slice(0, 1)}</span>
              <div>
                <strong>{user?.displayName || "Your account"}</strong>
                <span>Sign out</span>
              </div>
              <LogOut size={17} />
            </button>
          )}
        </div>
      </aside>
      <div className="workspace-body">
        <header className="workspace-header">
          <div>
            <button
              className="icon-button mobile-nav-button"
              aria-label="Open navigation"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={21} />
            </button>
            <span className="breadcrumb">
              Workspace <span>/</span>{" "}
              <strong>
                {section === "connections"
                  ? "Connected inboxes"
                  : section === "settings"
                    ? "Settings"
                    : "Applications"}
              </strong>
            </span>
          </div>
          <div className="workspace-header-actions">
            {demo && (
              <span className="demo-badge">
                <span />
                DEMO WORKSPACE
              </span>
            )}
            <ThemeToggle />
            <Link
              className="icon-button help-link"
              href="/#how-it-works"
              aria-label="How Replylane works"
            >
              <CircleHelp size={19} />
            </Link>
            <span className="header-avatar">
              {demo ? "M" : (user?.displayName || "Y").slice(0, 1)}
            </span>
          </div>
        </header>
        <main id="workspace-main" className="workspace-main">
          {demo && (
            <div className="demo-banner">
              <span>
                <Sparkles size={15} />
                <strong>A little preview of what’s possible.</strong> You’re exploring sample
                applications.
              </span>
              <Link href="/sign-up">
                Make it yours <ArrowUpRight size={15} />
              </Link>
            </div>
          )}
          {!demo && !user?.emailVerified && (
            <Alert severity="info" className="workspace-alert">
              Verify your email to activate your workspace.{" "}
              <button
                className="inline-link"
                onClick={async () => {
                  try {
                    await sendEmailVerification(user!);
                    setNotice("Verification email sent.");
                  } catch {
                    setNotice("Please wait before requesting another verification email.");
                  }
                }}
              >
                Resend verification email
              </button>{" "}
              ·{" "}
              <button
                className="inline-link"
                onClick={async () => {
                  await user!.reload();
                  window.location.reload();
                }}
              >
                I’ve verified it
              </button>
            </Alert>
          )}
          {(error || live.error) && (
            <Alert
              severity="error"
              className="workspace-alert"
              action={
                <Button
                  color="inherit"
                  size="small"
                  onClick={() => {
                    setError("");
                    void live.refetch();
                  }}
                >
                  Retry
                </Button>
              }
            >
              {error || (live.error as Error)?.message}
            </Alert>
          )}
          {section === "connections" ? (
            <Connections
              connections={connections}
              demo={demo}
              onRefresh={() => void live.refetch()}
              onNotice={setNotice}
            />
          ) : section === "settings" ? (
            <Settings
              demo={demo}
              onExport={() => exportData(true)}
              onNotice={setNotice}
              requests={live.data?.usage.requests || 0}
            />
          ) : (
            <>
              <div className="page-title-row">
                <div>
                  <span className="eyebrow">A LITTLE CLARITY. A LOT OF POSSIBILITY.</span>
                  <h1>
                    {heading}
                    <span className="heading-dot">.</span>
                  </h1>
                  <p>
                    {tab === "starred"
                      ? "The opportunities you’ve saved for another look."
                      : tab === "archive"
                        ? "A little history, for whenever you need it."
                        : "Every reply has a place. Every next step is a little clearer."}
                  </p>
                </div>
                <button className="button button-dark sync-main" onClick={() => void sync()}>
                  <RefreshCw size={16} className={demoSync ? "spin" : ""} />
                  {demoSync ? "Checking…" : "Sync inbox"}
                </button>
              </div>
              <div className="stats-grid">
                <Stat
                  label="APPLICATIONS"
                  value={active.length}
                  icon={<Inbox size={19} />}
                  foot="Your possibilities, organized"
                />
                <Stat
                  label="MOVING FORWARD"
                  value={nextSteps.length}
                  icon={<ArrowUpRight size={20} />}
                  foot="Conversations worth having"
                  className="stat-progress"
                />
                <Stat
                  label="OFFERS"
                  value={offers.length}
                  icon={<Gift size={19} />}
                  foot={offers.length ? "Something to feel good about" : "Good things take time"}
                  className="stat-offer"
                />
                <Stat
                  label="NEEDS A LOOK"
                  value={review.length}
                  icon={<Sparkles size={18} />}
                  foot="A little human judgment"
                  className="stat-review"
                />
              </div>
              {nextSteps.length > 0 && tab !== "archive" && (
                <div className="attention-strip">
                  <span className="attention-icon">
                    <Video size={19} />
                  </span>
                  <div>
                    <strong>Good things are moving forward.</strong>
                    <span>
                      {nextSteps.length}{" "}
                      {nextSteps.length === 1 ? "opportunity has" : "opportunities have"} a next
                      step waiting for you.
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setTab("attention");
                      setStatus("all");
                    }}
                  >
                    See next steps <ArrowRight size={15} />
                  </button>
                </div>
              )}
              <section className="applications-section" aria-label="Application board">
                <div className="applications-heading">
                  <div
                    className="application-tabs"
                    role="tablist"
                    aria-label="Application sections"
                  >
                    <button
                      role="tab"
                      aria-selected={tab === "all" || tab === "starred" || tab === "archive"}
                      className={tab !== "attention" ? "selected" : ""}
                      onClick={() => setTab(tab === "starred" || tab === "archive" ? tab : "all")}
                    >
                      {tab === "starred"
                        ? "Saved applications"
                        : tab === "archive"
                          ? "Archived applications"
                          : "All applications"}
                      <span>
                        {tab === "starred"
                          ? active.filter((a) => a.starred).length
                          : tab === "archive"
                            ? applications.filter((a) => a.archived).length
                            : active.length}
                      </span>
                    </button>
                    {!["starred", "archive"].includes(tab) && (
                      <button
                        role="tab"
                        aria-selected={tab === "attention"}
                        className={tab === "attention" ? "selected" : ""}
                        onClick={() => setTab("attention")}
                      >
                        Needs attention
                        <span>{nextSteps.length + offers.length + review.length}</span>
                      </button>
                    )}
                  </div>
                  <div className="view-controls">
                    <button
                      className={view === "board" ? "selected" : ""}
                      title="Board view"
                      aria-label="Board view"
                      aria-pressed={view === "board"}
                      onClick={() => setView("board")}
                    >
                      <LayoutGrid size={16} />
                      <span>Board</span>
                    </button>
                    <button
                      className={view === "list" ? "selected" : ""}
                      title="List view"
                      aria-label="List view"
                      aria-pressed={view === "list"}
                      onClick={() => setView("list")}
                    >
                      <List size={17} />
                      <span>List</span>
                    </button>
                  </div>
                </div>
                <div className="board-toolbar">
                  <label className="search-field">
                    <Search size={17} />
                    <input
                      aria-label="Search applications"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search companies, roles, or replies…"
                    />
                    {search && (
                      <button
                        className="icon-button"
                        aria-label="Clear search"
                        onClick={() => setSearch("")}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </label>
                  <div className="toolbar-actions">
                    <button
                      className={`filter-button ${filters ? "active" : ""}`}
                      onClick={() => setFilters(!filters)}
                      aria-expanded={filters}
                    >
                      <SlidersHorizontal size={15} />
                      Filters
                      {(status !== "all" ||
                        language !== "all" ||
                        dateFrom ||
                        dateTo ||
                        connectionId !== "all") && <i />}
                    </button>
                    <label className="sort-select">
                      <span className="sr-only">Sort applications</span>
                      <select value={sort} onChange={(e) => setSort(e.target.value)}>
                        <option value="newest">Newest first</option>
                        <option value="oldest">Oldest first</option>
                        <option value="company">Company A–Z</option>
                        <option value="deadline">Deadline first</option>
                        <option value="confidence">Confidence: low first</option>
                      </select>
                      <ChevronDown size={14} />
                    </label>
                    <button
                      className="icon-button export-button"
                      aria-label="Export filtered applications"
                      title="Export filtered applications"
                      onClick={() => exportData()}
                    >
                      <Download size={16} />
                    </button>
                  </div>
                </div>
                {filters && (
                  <div className="filter-panel">
                    <label>
                      Status
                      <select value={status} onChange={(e) => setStatus(e.target.value)}>
                        <option value="all">All statuses</option>
                        {statuses.map((s) => (
                          <option value={s} key={s}>
                            {statusLabels[s]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Language
                      <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                        <option value="all">All languages</option>
                        {[...new Set(applications.map((a) => a.language))].sort().map((l) => (
                          <option key={l} value={l}>
                            {(
                              {
                                en: "English",
                                fa: "Persian",
                                de: "German",
                                fr: "French",
                              } as Record<string, string>
                            )[l] || l}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Inbox
                      <select
                        value={connectionId}
                        onChange={(e) => setConnectionId(e.target.value)}
                      >
                        <option value="all">All inboxes</option>
                        {connections.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.email}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      From
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                      />
                    </label>
                    <label>
                      Until
                      <input
                        type="date"
                        value={dateTo}
                        min={dateFrom}
                        onChange={(e) => setDateTo(e.target.value)}
                      />
                    </label>
                    <button className="text-link" onClick={resetFilters}>
                      Clear filters
                    </button>
                  </div>
                )}
                {!demo && live.isLoading ? (
                  <div className="board-skeleton">
                    {[0, 1, 2, 3].map((i) => (
                      <Skeleton key={i} variant="rounded" height={260} />
                    ))}
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="empty-state">
                    <span>
                      <Inbox size={31} strokeWidth={1.4} />
                    </span>
                    <h3>
                      {applications.length === 0
                        ? "Your next chapter starts with a connection."
                        : "A little quiet here."}
                    </h3>
                    <p>
                      {applications.length === 0
                        ? "Connect your email to bring your application replies into view."
                        : "No applications match this view. Try a different search or filter."}
                    </p>
                    <button
                      className="button button-dark"
                      onClick={() =>
                        applications.length === 0
                          ? go("connections")
                          : (resetFilters(), setTab("all"))
                      }
                    >
                      {applications.length === 0 ? "Connect an inbox" : "Show all applications"}
                      <ArrowUpRight size={16} />
                    </button>
                  </div>
                ) : view === "board" ? (
                  <div className="kanban-scroll">
                    <div className="kanban-board">
                      {lanes.map((lane) => {
                        const cards = filtered.filter((a) => lane.statuses.includes(a.status));
                        return (
                          <section
                            className={`kanban-lane lane-${lane.id}`}
                            key={lane.id}
                            aria-label={`${lane.label}, ${cards.length} applications`}
                          >
                            <header>
                              <span>
                                <i />
                                {lane.label}
                                <b>{cards.length}</b>
                              </span>
                              <span className="lane-decoration">
                                {lane.id === "offer" ? "✧" : "···"}
                              </span>
                            </header>
                            <p className="lane-caption">{lane.caption}</p>
                            <div className="lane-cards">
                              {cards.map((a) => (
                                <ApplicationCard
                                  key={a.id}
                                  a={a}
                                  onOpen={() => setSelected(a.id)}
                                  onStar={() =>
                                    void patch(a.id, { starred: !a.starred }).catch((e) =>
                                      setError(e.message),
                                    )
                                  }
                                />
                              ))}
                              {cards.length === 0 && (
                                <div className="empty-lane">
                                  A little room for
                                  <br />
                                  {lane.id === "offer" ? "good news." : "what’s next."}
                                </div>
                              )}
                            </div>
                          </section>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="application-list">
                    <div className="list-heading">
                      <span>COMPANY & ROLE</span>
                      <span>STATUS</span>
                      <span>RECEIVED</span>
                      <span>LANGUAGE</span>
                      <span />
                    </div>
                    {filtered.map((a) => (
                      <div key={a.id} className="application-list-row">
                        <button className="list-company" onClick={() => setSelected(a.id)}>
                          <span className={`company-avatar ${a.color || "green"}`}>
                            {a.company.slice(0, 1)}
                          </span>
                          <span>
                            <strong dir="auto">{a.company}</strong>
                            <span dir="auto">{a.role}</span>
                          </span>
                        </button>
                        <button className="list-status" onClick={() => setSelected(a.id)}>
                          <span className={`status-badge ${a.status}`}>
                            <span />
                            {statusLabels[a.status]}
                          </span>
                        </button>
                        <span className="list-date">{displayDate(a.receivedAt)}</span>
                        <span className="list-language language-tag">
                          {a.language.toUpperCase()}
                        </span>
                        <button
                          className={`icon-button ${a.starred ? "is-starred" : ""}`}
                          onClick={() =>
                            void patch(a.id, { starred: !a.starred }).catch((e) =>
                              setError(e.message),
                            )
                          }
                          aria-label={`${a.starred ? "Unsave" : "Save"} ${a.company}`}
                        >
                          <Star size={16} fill={a.starred ? "currentColor" : "none"} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="board-footer">
                  <span>
                    {filtered.length} {filtered.length === 1 ? "application" : "applications"} in
                    view<span className="dot-separator">·</span>
                    {demo ? "Sample data" : "Read-only connections"}
                  </span>
                  <span>
                    <ShieldCheck size={13} />
                    Your inbox stays yours.
                  </span>
                </div>
              </section>
              <div className="workspace-footnote">
                <Sparkles size={14} />
                AI helps sort the replies. You always have the final word.
              </div>
            </>
          )}
        </main>
      </div>
      <ApplicationDetail
        application={applications.find((a) => a.id === selected) || null}
        onClose={() => setSelected(null)}
        onPatch={patch}
        demo={demo}
        busy={mutation.isPending}
      />
      <Snackbar
        open={!!notice}
        autoHideDuration={6000}
        onClose={() => setNotice("")}
        message={notice}
        action={
          <button
            className="snackbar-close"
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={17} />
          </button>
        }
      />
    </div>
  );
}
function Stat({
  label,
  value,
  icon,
  foot,
  className = "",
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  foot: string;
  className?: string;
}) {
  return (
    <div className={`stat-card ${className}`}>
      <div>
        <span>{label}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <strong>{value.toString().padStart(2, "0")}</strong>
      <p>{foot}</p>
    </div>
  );
}
function ApplicationCard({
  a,
  onOpen,
  onStar,
}: {
  a: Application;
  onOpen: () => void;
  onStar: () => void;
}) {
  return (
    <article className={`application-card card-${a.status}`}>
      <div className="card-company">
        <button onClick={onOpen}>
          <span className={`company-avatar ${a.color || "green"}`}>{a.company.slice(0, 1)}</span>
          <strong dir="auto">{a.company}</strong>
        </button>
        <button
          className={`icon-button star-button ${a.starred ? "is-starred" : ""}`}
          aria-label={`${a.starred ? "Unsave" : "Save"} ${a.company}`}
          onClick={onStar}
        >
          <Star size={14} fill={a.starred ? "currentColor" : "none"} />
        </button>
      </div>
      <button className="card-open" onClick={onOpen} aria-label={`View ${a.role} at ${a.company}`}>
        <h3 dir="auto">{a.role}</h3>
        <p>{a.summary}</p>
        <span className={`status-badge ${a.status}`}>
          <span />
          {statusLabels[a.status]}
        </span>
        <div className="card-sender">
          <Mail size={12} />
          <span dir="auto">{a.senderEmail}</span>
        </div>
        <div className="card-footer">
          <span>
            {new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(
              new Date(a.receivedAt),
            )}
          </span>
          <span>
            <span className="language-tag">{a.language.toUpperCase()}</span>
            <ArrowUpRight size={14} />
          </span>
        </div>
      </button>
    </article>
  );
}
