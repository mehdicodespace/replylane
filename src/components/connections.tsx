"use client";
import { useState, useRef } from "react";
import Link from "next/link";
import {
  Alert,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  CircularProgress,
  LinearProgress,
} from "@mui/material";
import {
  Mail,
  Plus,
  ShieldCheck,
  ArrowUpRight,
  Pause,
  Play,
  Unplug,
  Upload,
  RefreshCw,
  X,
  Check,
  Clock3,
} from "lucide-react";
import { displayDate, type Connection } from "@/lib/domain";
import { api, clientAuth } from "@/lib/firebase-client";

const providerNames: Record<string, string> = {
  google: "Gmail",
  microsoft: "Outlook / Microsoft 365",
  yahoo: "Yahoo Mail",
  icloud: "iCloud Mail",
  fastmail: "Fastmail",
  custom: "Other / custom domain (IMAP)",
  import: "Email files",
};
export function Connections({
  connections,
  demo,
  loading = false,
  loadError = false,
  onRefresh,
  onNotice,
}: {
  connections: Connection[];
  demo: boolean;
  loading?: boolean;
  loadError?: boolean;
  onRefresh: () => void;
  onNotice: (s: string) => void;
}) {
  const [dialog, setDialog] = useState(false);
  const [provider, setProvider] = useState("google");
  const [days, setDays] = useState(0);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [disconnect, setDisconnect] = useState<Connection | null>(null);
  const [history, setHistory] = useState<Connection | null>(null);
  const [historyDays, setHistoryDays] = useState(60);
  const [host, setHost] = useState("");
  const [username, setUsername] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const imap = ["yahoo", "icloud", "fastmail", "custom"].includes(provider);
  async function startHistory() {
    if (!history) return;
    setBusy(history.id);
    setError("");
    try {
      await api(`/api/mail/${history.id}`, {
        method: "PATCH",
        body: JSON.stringify({ historyDays, consent: true }),
      });
      setHistory(null);
      onRefresh();
      onNotice(`Importing the last ${historyDays} days. Watch progress on this inbox card.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function connect() {
    setError("");
    setBusy("connect");
    try {
      if (imap) {
        await api("/api/mail/imap", {
          method: "POST",
          body: JSON.stringify({
            provider,
            email,
            password,
            days,
            consent: true,
            ...(provider === "custom" ? { host, username } : {}),
          }),
        });
        setPassword("");
        setDialog(false);
        onRefresh();
        onNotice("Mailbox connected. Your first sync is queued.");
      } else {
        const result = await api<{ url: string }>("/api/mail/connect", {
          method: "POST",
          body: JSON.stringify({ provider, days, consent: true }),
        });
        window.location.assign(result.url);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function action(c: Connection, type: "pause" | "disconnect" | "sync") {
    if (demo) {
      onNotice("This is a demo mailbox. Create an account to connect your own inbox.");
      return;
    }
    setBusy(c.id);
    setError("");
    try {
      if (type === "sync") {
        await api("/api/mail/sync", {
          method: "POST",
          body: JSON.stringify({ id: c.id, force: true }),
        });
        onNotice("Inbox checked. Your import continues automatically.");
      } else if (type === "pause")
        await api(`/api/mail/${c.id}`, {
          method: "PATCH",
          body: JSON.stringify({ paused: c.status !== "paused" }),
        });
      else {
        await api(`/api/mail/${c.id}`, { method: "DELETE" });
        setDisconnect(null);
        onNotice("Mailbox disconnected. Stored credentials have been removed.");
      }
      onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function importFile(file: File) {
    if (file.size > 1024 * 1024 || !file.name.toLowerCase().endsWith(".eml")) {
      setError("Choose an .eml email file smaller than 1 MB.");
      return;
    }
    setBusy("import");
    setError("");
    try {
      const token = await clientAuth().currentUser?.getIdToken();
      const response = await fetch("/api/mail/import", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "message/rfc822",
          "X-AI-Consent": "true",
        },
        body: file,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      onNotice(
        body.duplicate
          ? "This email was already processed."
          : body.relevant
            ? "Application response imported."
            : "This email does not appear to be an application response. It was excluded.",
      );
      onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  return (
    <div className="connections-page">
      <div className="page-title-row">
        <div>
          <span className="eyebrow">ALL YOUR REPLIES, ONE HOME</span>
          <h1>
            Connected inboxes<span className="heading-dot">.</span>
          </h1>
          <p>Bring your opportunities together. Keep your inbox exactly as it is.</p>
        </div>
        <button
          className="button button-dark"
          onClick={() => {
            setDialog(true);
            setError("");
          }}
        >
          Connect an inbox <Plus size={17} />
        </button>
      </div>
      {error && (
        <Alert severity="error" className="workspace-alert">
          {error}
        </Alert>
      )}
      {loading ? (
        <div className="inboxes-loading" aria-label="Loading connected inboxes" aria-busy="true">
          <CircularProgress size={20} />
          <span>Loading your inboxes…</span>
        </div>
      ) : loadError ? (
        <div className="empty-state">
          <h3>Your inboxes couldn’t load.</h3>
          <p>Retry the workspace to check your connected accounts again.</p>
        </div>
      ) : (
        <>
          <div className="connection-grid">
            {connections
              .filter((c) => c.provider !== "import")
              .map((c) => (
                <article className="connection-card" key={c.id}>
                  <div className="connection-card-heading">
                    <span className={`provider-avatar ${c.provider}`}>
                      {c.provider === "google" ? (
                        "M"
                      ) : c.provider === "microsoft" ? (
                        "▦"
                      ) : (
                        <Mail size={22} />
                      )}
                    </span>
                    <span className={`connection-status ${c.status}`}>
                      <i />
                      {demo
                        ? "Demo connection"
                        : c.status === "connected"
                          ? "Connected"
                          : c.status === "paused"
                            ? "Paused"
                            : "Reconnect needed"}
                    </span>
                  </div>
                  <h3>{providerNames[c.provider] || c.provider}</h3>
                  <p className="connection-email">{c.email}</p>
                  <div className="connection-info">
                    <span>
                      <ShieldCheck size={14} />
                      Read-only access
                    </span>
                    <span>
                      <Clock3 size={14} />
                      {demo
                        ? "Sample inbox"
                        : c.lastSyncAt
                          ? `Checked ${new Date(c.lastSyncAt).toLocaleString()}`
                          : "First sync queued"}
                    </span>
                    <span>
                      <Check size={14} />
                      {c.processed} emails checked
                    </span>
                  </div>
                  <div className="import-progress" aria-live="polite">
                    <strong>
                      {c.syncing
                        ? "Checking emails…"
                        : c.status === "paused"
                          ? "Sync paused"
                          : c.error
                            ? "Waiting to retry"
                            : !c.importComplete
                              ? "Import in progress"
                              : "Watching for new emails"}
                    </strong>
                    {c.since && (
                      <p>
                        {c.importStartedAt ||
                        !c.importComplete ||
                        (c.createdAt && c.since < c.createdAt)
                          ? `History from ${displayDate(c.since)} · new emails included`
                          : "New emails only · earlier messages have not been scanned"}
                      </p>
                    )}
                    {(c.importStartedAt || !c.importComplete) && (
                      <>
                        <p>
                          {c.importChecked || 0} older emails checked · {c.importMatched || 0}{" "}
                          application replies found
                        </p>
                        {!c.importComplete && c.status === "connected" && !c.error && (
                          <LinearProgress aria-label="Import in progress" />
                        )}
                        <p>
                          {c.importComplete
                            ? "History import complete."
                            : "Checking emails in small batches. Application replies appear on your board as they are found."}
                        </p>
                      </>
                    )}
                    {c.status === "connected" && c.nextSyncAt && c.nextSyncAt > Date.now() && (
                      <p>
                        Next check:{" "}
                        {new Date(c.nextSyncAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    )}
                  </div>
                  {c.error && (
                    <Alert severity="warning" className="connection-error">
                      {c.error}
                    </Alert>
                  )}
                  <div className="connection-card-actions">
                    <button
                      className="text-link"
                      disabled={!!busy || c.status !== "connected"}
                      onClick={() => void action(c, "sync")}
                      title="Check this inbox now instead of waiting for its next automatic check"
                    >
                      <RefreshCw size={14} className={busy === c.id ? "spin" : ""} />
                      Check now
                    </button>
                    <button
                      className="text-link"
                      disabled={!!busy}
                      onClick={() => void action(c, "pause")}
                    >
                      {c.status === "paused" ? <Play size={14} /> : <Pause size={14} />}{" "}
                      {c.status === "paused" ? "Resume" : "Pause"}
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Disconnect ${c.email}`}
                      disabled={!!busy}
                      onClick={() =>
                        demo
                          ? onNotice(
                              "Demo connections are illustrative. Connect your own inbox after signing up.",
                            )
                          : setDisconnect(c)
                      }
                    >
                      <Unplug size={16} />
                    </button>
                  </div>
                  <button
                    className="text-link history-import-button"
                    disabled={
                      demo ||
                      !!busy ||
                      c.status !== "connected" ||
                      !c.importComplete ||
                      c.syncing ||
                      (c.historyDaysCompleted || 0) >= 60
                    }
                    onClick={() => {
                      setHistory(c);
                      setHistoryDays(60);
                      setError("");
                    }}
                  >
                    <Clock3 size={14} />
                    {(c.historyDaysCompleted || 0) >= 60
                      ? "60-day history complete"
                      : "Import older emails"}
                  </button>
                </article>
              ))}
            <button
              className="add-connection"
              onClick={() => {
                setDialog(true);
              }}
            >
              <span>
                <Plus size={24} />
              </span>
              <strong>Room for another inbox</strong>
              <p>
                Gmail, Outlook, Yahoo,
                <br />
                iCloud, Fastmail, or custom IMAP
              </p>
            </button>
          </div>
          <section className="import-section">
            <div>
              <span className="soft-icon">
                <Upload size={23} />
              </span>
              <div>
                <h3>A reply from somewhere else?</h3>
                <p>
                  Import an .eml file from any email provider. One message at a time, up to 1 MB.
                </p>
              </div>
            </div>
            <Button
              variant="outlined"
              disabled={!!busy || demo}
              startIcon={busy === "import" ? <CircularProgress size={15} /> : <Upload size={16} />}
              onClick={() => {
                setProvider("import");
                setDialog(true);
              }}
            >
              Import an email
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".eml,message/rfc822"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importFile(file);
              }}
            />
          </section>
          <div className="connection-privacy">
            <ShieldCheck size={20} />
            <p>
              Your original emails stay untouched. Only application responses and short excerpts are
              saved. Custom mail connections check the Inbox folder. Keep this preview open while
              importing.
            </p>
          </div>
        </>
      )}
      <Dialog open={dialog} onClose={() => !busy && setDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <div className="dialog-title">
            {provider === "import" ? "Bring a reply along" : "Connect your inbox"}
            <button
              className="icon-button"
              aria-label="Close connect dialog"
              onClick={() => setDialog(false)}
            >
              <X size={20} />
            </button>
          </div>
        </DialogTitle>
        <DialogContent>
          {demo ? (
            <div className="demo-connect-message">
              <span className="soft-icon">
                <Mail size={30} />
              </span>
              <h3>Your real inbox deserves its own workspace.</h3>
              <p>
                You’re exploring sample applications. Create an account to connect your email and
                organize your own replies.
              </p>
              <Link href="/sign-up" className="button button-dark">
                Create your workspace <ArrowUpRight size={17} />
              </Link>
            </div>
          ) : (
            <div className="connect-form">
              {error && <Alert severity="error">{error}</Alert>}
              {provider !== "import" && (
                <>
                  <TextField
                    fullWidth
                    select
                    label="Email provider"
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                  >
                    {Object.entries(providerNames)
                      .filter(([id]) => id !== "import")
                      .map(([id, label]) => (
                        <MenuItem key={id} value={id}>
                          {label}
                        </MenuItem>
                      ))}
                  </TextField>
                  <TextField
                    select
                    fullWidth
                    label="Where should we start?"
                    value={days}
                    onChange={(e) => setDays(Number(e.target.value))}
                  >
                    <MenuItem value={0}>New emails only · from this connection onward</MenuItem>
                    <MenuItem value={30}>Include the last 30 days</MenuItem>
                    <MenuItem value={60}>Include the last 60 days</MenuItem>
                  </TextField>
                  <p className="muted small">
                    {days === 0
                      ? "Start fresh. Existing emails will not be imported."
                      : "Recent emails will be checked automatically. Watch progress on your inbox card."}
                  </p>
                  {imap && (
                    <>
                      <TextField
                        type="email"
                        fullWidth
                        label="Mailbox email address"
                        autoComplete="off"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                      {provider === "custom" && (
                        <>
                          <TextField
                            fullWidth
                            label="IMAP server"
                            placeholder="From your mail hosting provider"
                            autoComplete="off"
                            value={host}
                            onChange={(e) => setHost(e.target.value)}
                            helperText="Encrypted connection on port 993. Ask your host for the exact server name."
                          />
                          <TextField
                            fullWidth
                            label="IMAP username (optional)"
                            placeholder="Usually your full email address"
                            autoComplete="off"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                          />
                        </>
                      )}
                      <TextField
                        type="password"
                        fullWidth
                        label="App-specific password"
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <Alert severity="info">
                        Create an app-specific password in your email provider’s security settings.
                        Use it here instead of your regular password. Only the Inbox folder is
                        checked through IMAP.
                      </Alert>
                    </>
                  )}
                </>
              )}
              <div className="consent-box">
                <ShieldCheck size={21} />
                <div>
                  <strong>Your inbox stays yours.</strong>
                  <p>
                    Connecting lets Replylane check emails in your selected date range and organize
                    application replies. Your original emails stay untouched. You can pause or
                    disconnect at any time.
                  </p>
                  <Link href="/privacy" target="_blank">
                    Read the privacy details ↗
                  </Link>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
        {!demo && (
          <DialogActions>
            <Button onClick={() => setDialog(false)}>Cancel</Button>
            <Button
              variant="contained"
              disabled={
                !!busy || (imap && (!email || !password || (provider === "custom" && !host)))
              }
              onClick={() => {
                if (provider === "import") {
                  setDialog(false);
                  fileInput.current?.click();
                } else void connect();
              }}
              endIcon={
                busy ? <CircularProgress size={15} color="inherit" /> : <ArrowUpRight size={17} />
              }
            >
              {provider === "import"
                ? "Choose an email file"
                : imap
                  ? "Connect securely"
                  : "Continue to provider"}
            </Button>
          </DialogActions>
        )}
      </Dialog>
      <Dialog open={!!history} onClose={() => !busy && setHistory(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Include earlier replies</DialogTitle>
        <DialogContent>
          <div className="connect-form">
            {error && <Alert severity="error">{error}</Alert>}
            <p>
              Import recent messages from {history?.email}. Your existing cards and notes stay in
              place, and new emails keep syncing.
            </p>
            <TextField
              select
              fullWidth
              label="History to include"
              value={historyDays}
              onChange={(e) => setHistoryDays(Number(e.target.value))}
            >
              <MenuItem value={30}>Last 30 days</MenuItem>
              <MenuItem value={60}>Last 60 days</MenuItem>
            </TextField>
            <p className="muted small">
              Already checked emails are skipped. Only job application responses appear on your
              board.
            </p>
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistory(null)} disabled={!!busy}>
            Cancel
          </Button>
          <Button variant="contained" disabled={!!busy} onClick={() => void startHistory()}>
            {busy ? "Starting…" : `Start ${historyDays}-day import`}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={!!disconnect} onClose={() => setDisconnect(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Disconnect this inbox?</DialogTitle>
        <DialogContent>
          <p>
            Syncing will stop and stored credentials will be removed. Existing application cards
            remain until you delete your workspace. You can also revoke access in your email
            provider’s security settings.
          </p>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDisconnect(null)}>Keep connected</Button>
          <Button
            color="error"
            disabled={!!busy}
            onClick={() => disconnect && void action(disconnect, "disconnect")}
          >
            Disconnect
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
