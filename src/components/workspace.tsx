"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Snackbar, Skeleton, Button, Drawer, useMediaQuery } from "@mui/material";
import { signOut, sendEmailVerification } from "firebase/auth";
import {
  ArrowUpRight,
  LayoutGrid,
  List,
  Search,
  SlidersHorizontal,
  Star,
  Trash2,
  ArchiveRestore,
  LoaderCircle,
  Link2,
  Settings as SettingsIcon,
  Archive,
  Menu,
  X,
  Download,
  ChevronDown,
  Sparkles,
  Inbox,
  ShieldCheck,
  LogOut,
  CircleHelp,
} from "lucide-react";
import { Brand, ThemeToggle } from "./brand";
import { AccountMenu } from "./account-menu";
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
  reviewLane,
} from "@/lib/domain";
import { ApplicationDetail } from "./application-detail";
import { Connections } from "./connections";
import { Settings } from "./settings";
import { workspacePath, type WorkspaceRoute } from "@/lib/workspace-navigation";

interface WorkspaceData {
  applications: Application[];
  connections: Connection[];
  usage: { requests: number; tokens: number; requestLimit?: number };
  hasMore?: boolean;
}
interface TelegramStatus {
  configured: boolean;
  connected: boolean;
  botUsername?: string;
}
export function Workspace({
  demo = false,
  route = "applications",
}: {
  demo?: boolean;
  route?: WorkspaceRoute;
}) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const demoState = useDemo();
  const { view, setView } = useUI();
  const section =
    route === "inboxes" ? "connections" : route === "settings" ? "settings" : "applications";
  const tab =
    route === "saved"
      ? "starred"
      : route === "archive"
        ? "archive"
        : route === "attention"
          ? "attention"
          : route === "review"
            ? "review"
            : route === "rejected"
              ? "rejected"
              : route === "trash"
                ? "trash"
                : "all";
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
  const [clientReady, setClientReady] = useState(false);
  const mobileViewport = useMediaQuery("(max-width:760px)");
  useEffect(() => setClientReady(true), []);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!demo && !authLoading && !user) router.replace("/sign-in");
  }, [demo, authLoading, user, router]);
  useEffect(() => {
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
    refetchInterval: (query) =>
      query.state.data?.connections.some((c) => !c.importComplete || c.syncing) ? 5000 : 30000,
  });
  const telegramStatus = useQuery({
    queryKey: ["telegram-status"],
    queryFn: () => api<TelegramStatus>("/api/telegram"),
    enabled: !demo && Boolean(user),
    staleTime: 60_000,
  });
  async function retryWorkspace() {
    try {
      await user?.getIdToken(true);
    } catch {
      // The refetch below will show the actionable API error if the session is still invalid.
    }
    await queryClient.invalidateQueries({ queryKey: ["telegram-status"] });
    await live.refetch();
  }
  useEffect(() => {
    if (demo || !user?.emailVerified) return;
    let stopped = false;
    let running = false;
    async function tick() {
      if (stopped || running || document.hidden) return;
      const data = queryClient.getQueryData<WorkspaceData>(["workspace", user?.uid]);
      const due = data?.connections
        .filter(
          (c) =>
            c.provider !== "import" &&
            c.status === "connected" &&
            !c.syncing &&
            (c.nextSyncAt || 0) <= Date.now(),
        )
        .sort((a, b) => (a.nextSyncAt || 0) - (b.nextSyncAt || 0))[0];
      if (!due) return;
      running = true;
      try {
        await api("/api/mail/sync", { method: "POST", body: JSON.stringify({ id: due.id }) });
      } catch {
        // The server retains queued work and exposes retry/allowance details on
        // the inbox card. Another tab or the hosted worker may own the lease.
      } finally {
        await queryClient.invalidateQueries({ queryKey: ["workspace", user?.uid] });
        running = false;
      }
    }
    const timer = setInterval(() => void tick(), 2500);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [demo, user?.uid, user?.emailVerified, queryClient]);
  const applications = demo ? demoState.applications : live.data?.applications || [];
  const connections = demo ? demoConnections : live.data?.connections || [];
  const pendingImports = connections.filter((c) => !c.importComplete);
  const active = applications.filter((a) => !a.archived && !a.trashed);
  const mutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ApplicationPatch }) =>
      api(`/api/applications/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onMutate: async ({ id, patch }) => {
      if (typeof patch.starred !== "boolean") return;
      const key = ["workspace", user?.uid] as const;
      await queryClient.cancelQueries({ queryKey: key });
      const current = queryClient.getQueryData<WorkspaceData>(key);
      const previousStarred = current?.applications.find((item) => item.id === id)?.starred;
      queryClient.setQueryData<WorkspaceData>(key, (data) =>
        data
          ? {
              ...data,
              applications: data.applications.map((item) =>
                item.id === id ? { ...item, starred: patch.starred! } : item,
              ),
            }
          : data,
      );
      return { id, previousStarred, key };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousStarred === undefined) return;
      queryClient.setQueryData<WorkspaceData>(context.key, (data) =>
        data
          ? {
              ...data,
              applications: data.applications.map((item) =>
                item.id === context.id ? { ...item, starred: context.previousStarred! } : item,
              ),
            }
          : data,
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["workspace"] }),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/api/applications/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workspace"] }),
  });
  async function patch(id: string, p: ApplicationPatch) {
    if (demo) {
      demoState.patch(id, p);
      return;
    }
    await mutation.mutateAsync({ id, patch: p });
  }
  async function permanentlyDelete(id: string) {
    if (demo) return;
    await deleteMutation.mutateAsync(id);
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
  const boardApplications =
    view === "board" && tab !== "trash"
      ? filtered.filter((application) => application.status !== "received")
      : filtered;
  const acknowledgmentsOnly =
    view === "board" &&
    filtered.length > 0 &&
    boardApplications.length === 0 &&
    filtered.every((application) => application.status === "received");
  function go(s: string, t = "all") {
    router.push(workspacePath(s, t, demo));
    setMobileNav(false);
  }
  function setTab(t: string) {
    go("applications", t);
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
      ? "Saved applications"
      : tab === "archive"
        ? "Archive"
        : tab === "attention"
          ? "Move forward"
          : tab === "review"
            ? "Needs review"
            : tab === "rejected"
              ? "Rejected applications"
              : tab === "trash"
                ? "Trash"
                : "Applications";
  const nextSteps = active.filter((a) => ["interview", "next_step"].includes(a.status));
  const offers = active.filter((a) => a.status === "offer");
  const review = active.filter((a) => a.status === "review");
  const attentionStatuses = ["interview", "next_step", "offer"];
  const visibleLanes =
    tab === "trash"
      ? [{ id: "trash", label: "Trash", statuses: [...statuses], caption: "Items you moved here" }]
      : tab === "review"
        ? [reviewLane]
        : tab === "all"
          ? [...lanes, reviewLane]
          : tab === "attention"
            ? lanes.filter((lane) =>
                lane.statuses.some((status) => attentionStatuses.includes(status)),
              )
            : tab === "rejected"
              ? lanes.filter((lane) => lane.id === "rejected")
              : lanes;
  if (demo ? !clientReady : authLoading || !user)
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
      <Drawer
        variant={mobileViewport ? "temporary" : "permanent"}
        open={!mobileViewport || mobileNav}
        onClose={() => setMobileNav(false)}
        slotProps={{ paper: { className: "sidebar", "aria-label": "Workspace navigation" } }}
      >
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
              section === "applications" && !["starred", "archive", "trash"].includes(tab)
                ? "active"
                : ""
            }
          >
            <LayoutGrid size={18} />
            Applications
            <span className="nav-count">{live.isLoading ? "…" : active.length}</span>
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
      </Drawer>
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
            {demo ? <span className="header-avatar">M</span> : <AccountMenu />}
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
                  try {
                    await user!.reload();
                    await user!.getIdToken(true);
                    window.location.reload();
                  } catch {
                    setNotice("Verification couldn't be checked. Please try again.");
                  }
                }}
              >
                I’ve verified it
              </button>
            </Alert>
          )}
          {(error || (user?.emailVerified && live.error)) && (
            <Alert
              severity="error"
              className="workspace-alert"
              action={
                <Button
                  color="inherit"
                  size="small"
                  onClick={() => {
                    setError("");
                    void retryWorkspace();
                  }}
                >
                  Retry
                </Button>
              }
            >
              {error || (live.error as Error)?.message}
            </Alert>
          )}
          {!demo && section !== "connections" && pendingImports.length > 0 && (
            <Alert
              severity={pendingImports.some((c) => c.error) ? "warning" : "info"}
              className="workspace-alert"
              action={
                <Button color="inherit" size="small" onClick={() => go("connections")}>
                  View progress
                </Button>
              }
            >
              {pendingImports.some((c) => c.error)
                ? "Email import is waiting to retry."
                : "Importing earlier emails."}{" "}
              {pendingImports.reduce((n, c) => n + (c.importChecked || 0), 0)} checked ·{" "}
              {pendingImports.reduce((n, c) => n + (c.importMatched || 0), 0)} application replies
              found.
            </Alert>
          )}
          {section === "connections" ? (
            <Connections
              connections={connections}
              demo={demo}
              loading={!demo && live.isLoading}
              loadError={!demo && live.isError && !live.data}
              onRefresh={() => void live.refetch()}
              onNotice={setNotice}
            />
          ) : section === "settings" ? (
            <Settings
              demo={demo}
              loading={!demo && live.isLoading}
              loadError={!demo && live.isError && !live.data}
              onNotice={setNotice}
              requests={live.data?.usage.requests || 0}
              requestLimit={live.data?.usage.requestLimit || 300}
              onRetry={() => void retryWorkspace()}
              emailVerified={Boolean(user?.emailVerified)}
              loadErrorMessage={(live.error as Error)?.message}
            />
          ) : (
            <>
              <div className="page-title-row">
                <div>
                  <h1>
                    {heading}
                    <span className="heading-dot">.</span>
                  </h1>
                  <p>
                    {live.isLoading
                      ? "Loading your applications…"
                      : live.isError && !live.data
                        ? "Your applications couldn’t load."
                        : `${filtered.length} application replies · select a company for details`}
                  </p>
                </div>
                <div className="applications-title-actions">
                  <button
                    className="button button-small inbox-shortcut"
                    onClick={() => go("connections")}
                  >
                    <Link2 size={16} /> Connected inboxes
                  </button>
                  {!demo && telegramStatus.data?.configured && (
                    <Link
                      href="/app/settings"
                      className={`telegram-inline-action${telegramStatus.data.connected ? " is-connected" : ""}`}
                      title={
                        telegramStatus.data.connected
                          ? `Connected to @${telegramStatus.data.botUsername}; alerts are on`
                          : "Get new reply alerts in Telegram"
                      }
                    >
                      <span className="telegram-inline-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none">
                          <path
                            d="M21.7 3.3 18.5 20c-.2 1.1-.8 1.4-1.7.9l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.4-4.9 9-8.1c.4-.4-.1-.6-.6-.2L6.4 13.8l-4.7-1.5c-1-.3-1-1 .2-1.5L20.3 3.1c.8-.3 1.6.2 1.4.2Z"
                            fill="currentColor"
                          />
                        </svg>
                      </span>
                      {telegramStatus.data.connected ? "Telegram alerts on" : "Connect Telegram"}
                    </Link>
                  )}
                </div>
              </div>
              <section className="applications-section" aria-label="Application board">
                <div className="applications-heading">
                  <div
                    className="application-tabs"
                    role="tablist"
                    aria-label="Application sections"
                  >
                    {!["starred", "archive"].includes(tab) && (
                      <button
                        role="tab"
                        aria-selected={tab === "all"}
                        className={tab === "all" ? "selected" : ""}
                        data-tab="all"
                        onClick={() => setTab("all")}
                      >
                        All applications
                        <span>{active.length}</span>
                      </button>
                    )}
                    {["starred", "archive"].includes(tab) && (
                      <button
                        role="tab"
                        aria-selected
                        className="selected"
                        data-tab={tab}
                        onClick={() => setTab(tab)}
                      >
                        {tab === "starred" ? "Saved applications" : "Archived applications"}
                        <span>
                          {tab === "starred"
                            ? active.filter((a) => a.starred).length
                            : applications.filter((a) => a.archived).length}
                        </span>
                      </button>
                    )}
                    {!["starred", "archive"].includes(tab) && (
                      <button
                        role="tab"
                        aria-selected={tab === "attention"}
                        className={tab === "attention" ? "selected" : ""}
                        data-tab="attention"
                        onClick={() => setTab("attention")}
                      >
                        Move forward
                        <span>{nextSteps.length + offers.length}</span>
                      </button>
                    )}
                    {!["starred", "archive"].includes(tab) && (
                      <button
                        role="tab"
                        aria-selected={tab === "review"}
                        className={tab === "review" ? "selected" : ""}
                        data-tab="review"
                        onClick={() => setTab("review")}
                      >
                        Needs review
                        <span>{review.length}</span>
                      </button>
                    )}
                    {!["starred", "archive"].includes(tab) && (
                      <button
                        role="tab"
                        aria-selected={tab === "trash"}
                        className={tab === "trash" ? "selected" : ""}
                        data-tab="trash"
                        onClick={() => setTab("trash")}
                      >
                        Trash
                        <span>{applications.filter((a) => a.trashed).length}</span>
                      </button>
                    )}
                    {!["starred", "archive"].includes(tab) && (
                      <button
                        role="tab"
                        aria-selected={tab === "rejected"}
                        className={tab === "rejected" ? "selected" : ""}
                        data-tab="rejected"
                        onClick={() => setTab("rejected")}
                      >
                        Rejected
                        <span>{active.filter((a) => a.status === "rejected").length}</span>
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
                {!demo && !user?.emailVerified ? (
                  <div className="empty-state workspace-load-error" role="status">
                    <span>
                      <ShieldCheck size={29} strokeWidth={1.5} />
                    </span>
                    <h3>Verify your email to load applications.</h3>
                    <p>Once verified, your replies and inbox data will appear here.</p>
                    <button
                      className="button button-dark"
                      onClick={async () => {
                        try {
                          await user?.reload();
                          await user?.getIdToken(true);
                          window.location.reload();
                        } catch {
                          setNotice("Verification couldn’t be checked. Please try again.");
                        }
                      }}
                    >
                      I’ve verified my email
                    </button>
                  </div>
                ) : !demo && live.isLoading ? (
                  <div className="board-skeleton">
                    {Array.from({ length: visibleLanes.length }, (_, i) => i).map((i) => (
                      <Skeleton key={i} variant="rounded" height={260} />
                    ))}
                  </div>
                ) : !demo && live.isError && !live.data ? (
                  <div className="empty-state workspace-load-error" role="alert">
                    <span>
                      <Inbox size={29} strokeWidth={1.5} />
                    </span>
                    <h3>Your applications couldn’t load.</h3>
                    <p>
                      {user?.emailVerified
                        ? (live.error as Error)?.message ||
                          "The workspace request failed. Check your connection and try again."
                        : "Verify your email address to load your workspace data."}
                    </p>
                    <button
                      className="button button-dark"
                      onClick={async () => {
                        if (!user?.emailVerified) {
                          await user?.reload();
                          await user?.getIdToken(true);
                          window.location.reload();
                          return;
                        }
                        void retryWorkspace();
                      }}
                    >
                      {user?.emailVerified ? "Try again" : "I’ve verified my email"}
                    </button>
                  </div>
                ) : (view === "board" ? boardApplications : filtered).length === 0 ? (
                  <div className="empty-state">
                    <span>
                      <Inbox size={31} strokeWidth={1.4} />
                    </span>
                    <h3>
                      {applications.length === 0
                        ? "Your next chapter starts with a connection."
                        : acknowledgmentsOnly
                          ? "Routine acknowledgments are tucked away."
                          : "A little quiet here."}
                    </h3>
                    <p>
                      {applications.length === 0
                        ? "Connect your email to bring your application replies into view."
                        : acknowledgmentsOnly
                          ? "You can still find these replies in List view when you need them."
                          : "No applications match this view. Try a different search or filter."}
                    </p>
                    <button
                      className="button button-dark"
                      onClick={() =>
                        applications.length === 0
                          ? go("connections")
                          : acknowledgmentsOnly
                            ? setView("list")
                            : (resetFilters(), setTab("all"))
                      }
                    >
                      {applications.length === 0
                        ? "Connect an inbox"
                        : acknowledgmentsOnly
                          ? "View list"
                          : "Show all applications"}
                      <ArrowUpRight size={16} />
                    </button>
                  </div>
                ) : view === "board" ? (
                  <div className="kanban-scroll">
                    <div
                      className="kanban-board"
                      style={{
                        gridTemplateColumns: ["rejected", "review", "trash"].includes(tab)
                          ? "minmax(min(100%, 420px), 420px)"
                          : `repeat(${visibleLanes.length}, minmax(168px, 1fr))`,
                        minWidth: ["rejected", "review", "trash"].includes(tab)
                          ? 0
                          : `${visibleLanes.length * 168 + (visibleLanes.length - 1) * 12}px`,
                      }}
                    >
                      {visibleLanes.map((lane) => {
                        const cards = boardApplications.filter((a) =>
                          lane.statuses.includes(a.status),
                        );
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
                            <div className="lane-cards">
                              {cards.map((a) => (
                                <ApplicationCard
                                  key={a.id}
                                  a={a}
                                  onOpen={() => setSelected(a.id)}
                                  onTrash={
                                    tab === "trash"
                                      ? undefined
                                      : () =>
                                          patch(a.id, { trashed: true, archived: false }).catch(
                                            (error) => {
                                              setError(error.message);
                                              throw error;
                                            },
                                          )
                                  }
                                  onPermanentDelete={
                                    tab === "trash"
                                      ? () =>
                                          permanentlyDelete(a.id).catch((requestError) => {
                                            setError(requestError.message);
                                            throw requestError;
                                          })
                                      : undefined
                                  }
                                  onRestore={
                                    tab === "trash"
                                      ? () =>
                                          patch(a.id, { trashed: false }).catch((requestError) => {
                                            setError(requestError.message);
                                            throw requestError;
                                          })
                                      : undefined
                                  }
                                  onStar={() =>
                                    void patch(a.id, { starred: !a.starred }).catch((e) =>
                                      setError(e.message),
                                    )
                                  }
                                />
                              ))}
                              {cards.length === 0 && (
                                <div className="empty-lane">
                                  <Inbox size={17} aria-hidden="true" />
                                  <strong>
                                    {lane.id === "offer"
                                      ? "No offers yet"
                                      : lane.id === "review"
                                        ? "Nothing needs review"
                                        : "No replies here yet"}
                                  </strong>
                                  <small>New replies in this category will appear here.</small>
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
                          <span className={`company-avatar ${a.color || "blue"}`}>
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
                    {(view === "board" ? boardApplications : filtered).length}{" "}
                    {(view === "board" ? boardApplications : filtered).length === 1
                      ? "application"
                      : "applications"}{" "}
                    in view<span className="dot-separator">·</span>
                    {view === "board" && boardApplications.length < filtered.length
                      ? `${filtered.length - boardApplications.length} acknowledgments shown in List view · `
                      : ""}
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
        onPermanentDelete={permanentlyDelete}
        onRestore={(id) => patch(id, { trashed: false })}
        demo={demo}
        busy={mutation.isPending || deleteMutation.isPending}
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
function ApplicationCard({
  a,
  onOpen,
  onStar,
  onTrash,
  onPermanentDelete,
  onRestore,
}: {
  a: Application;
  onOpen: () => void;
  onStar: () => void;
  onTrash?: () => Promise<void>;
  onPermanentDelete?: () => Promise<void>;
  onRestore?: () => Promise<void>;
}) {
  const [confirmAction, setConfirmAction] = useState<"move" | "delete" | null>(null);
  const [workingAction, setWorkingAction] = useState<"move" | "restore" | "delete" | null>(null);
  return (
    <article className={`application-card compact-card card-${a.status}`}>
      <button
        className="compact-card-open"
        onClick={onOpen}
        aria-label={`View details for ${a.company}`}
        title={`${a.company} · ${a.role}`}
      >
        <span className="compact-card-copy">
          <strong dir="auto">{a.company}</strong>
          <time dateTime={a.receivedAt}>
            {new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(
              new Date(a.receivedAt),
            )}
          </time>
        </span>
      </button>
      <div className="compact-card-actions">
        <button
          className={`icon-button star-button ${a.starred ? "is-starred" : ""}`}
          aria-label={`${a.starred ? "Unsave" : "Save"} ${a.company}`}
          disabled={!!workingAction}
          onClick={onStar}
        >
          <Star size={14} fill={a.starred ? "currentColor" : "none"} />
        </button>
        {onRestore && (
          <button
            className="icon-button card-restore-button"
            aria-label={`Restore ${a.company} from Trash`}
            title="Restore from Trash"
            disabled={!!workingAction}
            onClick={async () => {
              setWorkingAction("restore");
              try {
                await onRestore();
              } catch {
                // The workspace displays the request error.
              } finally {
                setWorkingAction(null);
              }
            }}
          >
            {workingAction === "restore" ? (
              <LoaderCircle className="action-spinner" size={15} />
            ) : (
              <ArchiveRestore size={15} />
            )}
          </button>
        )}
        {(onTrash || onPermanentDelete) && (
          <button
            className="icon-button card-trash-button"
            aria-label={
              onPermanentDelete ? `Permanently delete ${a.company}` : `Move ${a.company} to Trash`
            }
            aria-expanded={!!confirmAction}
            title={onPermanentDelete ? "Delete permanently" : "Move to Trash"}
            disabled={!!workingAction}
            onClick={() =>
              onPermanentDelete
                ? setConfirmAction((value) => (value === "delete" ? null : "delete"))
                : setConfirmAction((value) => (value === "move" ? null : "move"))
            }
          >
            {workingAction === "move" || workingAction === "delete" ? (
              <LoaderCircle className="action-spinner" size={15} />
            ) : (
              <Trash2 size={15} />
            )}
          </button>
        )}
      </div>
      {confirmAction === "move" && onTrash && (
        <div className="card-trash-confirm" role="group" aria-label={`Move ${a.company} to Trash?`}>
          <span>Move to Trash?</span>
          <button
            className="card-trash-confirm-action"
            disabled={!!workingAction}
            onClick={async () => {
              setWorkingAction("move");
              try {
                await onTrash();
              } catch {
                // The workspace displays the request error.
                setWorkingAction(null);
                return;
              }
              setConfirmAction(null);
              setWorkingAction(null);
            }}
          >
            {workingAction === "move" ? (
              <>
                <LoaderCircle className="action-spinner" size={12} /> Moving…
              </>
            ) : (
              "Move"
            )}
          </button>
          <button disabled={!!workingAction} onClick={() => setConfirmAction(null)}>
            Cancel
          </button>
        </div>
      )}
      {confirmAction === "delete" && onPermanentDelete && (
        <div
          className="card-trash-confirm"
          role="group"
          aria-label={`Permanently delete ${a.company}?`}
        >
          <span>Delete permanently?</span>
          <button
            className="card-trash-confirm-action"
            disabled={!!workingAction}
            onClick={async () => {
              setWorkingAction("delete");
              try {
                await onPermanentDelete();
              } catch {
                // The workspace displays the request error.
                setWorkingAction(null);
                return;
              }
              setConfirmAction(null);
              setWorkingAction(null);
            }}
          >
            {workingAction === "delete" ? (
              <>
                <LoaderCircle className="action-spinner" size={12} /> Deleting…
              </>
            ) : (
              "Delete"
            )}
          </button>
          <button disabled={!!workingAction} onClick={() => setConfirmAction(null)}>
            Cancel
          </button>
        </div>
      )}
    </article>
  );
}
