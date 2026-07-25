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
  Checkbox,
  FormControlLabel,
  CircularProgress,
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
import type { Connection } from "@/lib/domain";
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
  onRefresh,
  onNotice,
}: {
  connections: Connection[];
  demo: boolean;
  onRefresh: () => void;
  onNotice: (s: string) => void;
}) {
  const [dialog, setDialog] = useState(false);
  const [provider, setProvider] = useState("google");
  const [days, setDays] = useState(0);
  const [consent, setConsent] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [disconnect, setDisconnect] = useState<Connection | null>(null);
  const [host, setHost] = useState("");
  const [username, setUsername] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const imap = ["yahoo", "icloud", "fastmail", "custom"].includes(provider);
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
            consent,
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
          body: JSON.stringify({ provider, days, consent }),
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
        await api("/api/mail/sync", { method: "POST", body: JSON.stringify({ id: c.id }) });
        onNotice("Sync checked. Queued emails continue within your AI allowance.");
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
            setConsent(false);
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
                  {c.processed} emails checked ·{" "}
                  {c.importComplete ? "Up to date with import" : "Import in progress"}
                </span>
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
                >
                  <RefreshCw size={14} className={busy === c.id ? "spin" : ""} />
                  Sync
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
            </article>
          ))}
        <button
          className="add-connection"
          onClick={() => {
            setDialog(true);
            setConsent(false);
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
            <p>Import an .eml file from any email provider. One message at a time, up to 1 MB.</p>
          </div>
        </div>
        <Button
          variant="outlined"
          disabled={!!busy || demo}
          startIcon={busy === "import" ? <CircularProgress size={15} /> : <Upload size={16} />}
          onClick={() => {
            setProvider("import");
            setConsent(false);
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
          Replylane never sends, deletes, or marks messages as read. Relevant text is processed by
          Groq after you give consent. Only application results and short excerpts are saved. IMAP
          currently checks the Inbox folder; OAuth connections include received mail across folders.
        </p>
      </div>
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
                      : "Recent messages are processed gradually. Import speed depends on the shared AI allowance."}
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
                  <strong>You decide what happens next.</strong>
                  <p>
                    To identify application replies, Replylane reads message text in your chosen
                    range and sends a shortened, redacted excerpt to Groq. Unrelated emails may be
                    processed to determine relevance, then their content is discarded. Short
                    excerpts of application responses are stored in your workspace.
                  </p>
                  <Link href="/privacy" target="_blank">
                    Read the privacy details ↗
                  </Link>
                </div>
              </div>
              <FormControlLabel
                control={
                  <Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                }
                label="I agree to this email processing and the use of Groq for classification."
              />
            </div>
          )}
        </DialogContent>
        {!demo && (
          <DialogActions>
            <Button onClick={() => setDialog(false)}>Cancel</Button>
            <Button
              variant="contained"
              disabled={
                !consent ||
                !!busy ||
                (imap && (!email || !password || (provider === "custom" && !host)))
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
