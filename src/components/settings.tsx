"use client";
import { useState } from "react";
import Link from "next/link";
import {
  Alert,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
} from "@mui/material";
import { sendPasswordResetEmail, signOut } from "firebase/auth";
import { Moon, Sun, ShieldCheck, Download, RotateCcw, Trash2, Check, Mail } from "lucide-react";
import { useAuth } from "./providers";
import { useUI, useDemo } from "@/lib/store";
import { api, clientAuth } from "@/lib/firebase-client";

export function Settings({
  demo,
  onExport,
  onNotice,
  requests,
  requestLimit,
  loading = false,
  loadError = false,
}: {
  demo: boolean;
  onExport: () => void;
  onNotice: (s: string) => void;
  requests: number;
  requestLimit: number;
  loading?: boolean;
  loadError?: boolean;
}) {
  const { theme, setTheme } = useUI();
  const { user } = useAuth();
  const reset = useDemo((s) => s.reset);
  const [deleting, setDeleting] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    setBusy(true);
    setError("");
    try {
      await api("/api/workspace", {
        method: "DELETE",
        body: JSON.stringify({ confirmation: confirm }),
      });
      await signOut(clientAuth());
      window.location.assign("/");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-page">
      <div className="page-title-row">
        <div>
          <span className="eyebrow">YOUR WORKSPACE, YOUR WAY</span>
          <h1>
            Make yourself at home<span className="heading-dot">.</span>
          </h1>
          <p>A few thoughtful controls to keep everything feeling right.</p>
        </div>
      </div>
      <div className="settings-grid">
        <section className="settings-card">
          <h3>Appearance</h3>
          <p>A little lighter, or a little quieter.</p>
          <div className="theme-options">
            {(["light", "dark"] as const).map((t) => (
              <button key={t} onClick={() => setTheme(t)} className={theme === t ? "selected" : ""}>
                {t === "light" ? <Sun size={24} /> : <Moon size={24} />}
                <span>{t === "light" ? "Light" : "Dark"}</span>
                {theme === t && <Check size={15} />}
              </button>
            ))}
          </div>
        </section>
        <section className="settings-card">
          <h3>Your account</h3>
          <p>{demo ? "You’re in the sample workspace." : user?.email}</p>
          <div className="settings-info">
            <Mail size={17} />
            <span>
              {demo
                ? "No account or email is connected in the demo."
                : user?.emailVerified
                  ? "Your email is verified."
                  : "Verify your email before connecting a mailbox."}
            </span>
          </div>
          {demo ? (
            <Link href="/sign-up" className="text-link">
              Create your own workspace ↗
            </Link>
          ) : (
            <Button
              variant="outlined"
              size="small"
              onClick={async () => {
                try {
                  await sendPasswordResetEmail(clientAuth(), user!.email!);
                  onNotice("Password reset link sent. Check your inbox.");
                } catch {
                  onNotice("Couldn't send the reset email. Please try again later.");
                }
              }}
            >
              Send password reset link
            </Button>
          )}
        </section>
        <section className="settings-card">
          <h3>Your data goes with you.</h3>
          <p>
            Export all application cards as a spreadsheet-friendly CSV. Notes and next steps come
            along.
          </p>
          <Button variant="outlined" startIcon={<Download size={16} />} onClick={onExport}>
            Export applications
          </Button>
          <div className="settings-info">
            <ShieldCheck size={17} />
            <Link href="/privacy">How your information is handled ↗</Link>
          </div>
        </section>
        <section className="settings-card">
          <h3>Today's processing</h3>
          <p>
            {loading
              ? "Loading your usage…"
              : loadError
                ? "Your usage couldn’t load. Retry the workspace."
                : demo
                  ? "Your demo uses sample replies."
                  : `${requests} processing batches used today.`}
          </p>
          {!loadError && (
            <div className="usage-rail">
              <span
                style={{
                  width: `${loading ? 30 : Math.min(100, (requests / requestLimit) * 100)}%`,
                }}
              />
            </div>
          )}
          <p className="small muted">
            Up to {requestLimit} processing batches are available per account each day. Each batch
            can cover several emails; queued messages continue after the daily reset.
          </p>
        </section>
      </div>
      <section className="danger-zone">
        <div>
          <h3>{demo ? "A clean slate" : "When you're ready to move on"}</h3>
          <p>
            {demo
              ? "Reset the sample board, including notes, saved cards, and status changes."
              : "Delete your account, connected credentials, and application history. This cannot be undone."}
          </p>
        </div>
        <Button
          variant="outlined"
          color={demo ? "primary" : "error"}
          startIcon={demo ? <RotateCcw size={16} /> : <Trash2 size={16} />}
          onClick={() => {
            if (demo) {
              reset();
              onNotice("Demo workspace reset.");
            } else setDeleting(true);
          }}
        >
          {demo ? "Reset demo" : "Delete my account"}
        </Button>
      </section>
      <Dialog open={deleting} onClose={() => !busy && setDeleting(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete your workspace?</DialogTitle>
        <DialogContent>
          <p>
            Your account, notes, application history, and stored mailbox credentials will be
            permanently deleted. Your original emails stay with your mail provider.
          </p>
          <p>
            For security, sign out and sign in again first if your session is older than five
            minutes. Type DELETE to confirm.
          </p>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            fullWidth
            label="Confirmation"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(false)} disabled={busy}>
            Keep my workspace
          </Button>
          <Button
            color="error"
            disabled={confirm !== "DELETE" || busy}
            onClick={() => void remove()}
          >
            {busy ? "Deleting…" : "Delete permanently"}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
