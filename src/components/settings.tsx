"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Alert,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  InputAdornment,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  EmailAuthProvider,
  linkWithCredential,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signOut,
  updatePassword,
} from "firebase/auth";
import {
  Moon,
  Sun,
  ShieldCheck,
  RotateCcw,
  Trash2,
  Check,
  Mail,
  KeyRound,
  Send,
  Unplug,
  Eye,
  EyeOff,
} from "lucide-react";
import { useAuth } from "./providers";
import { useUI, useDemo } from "@/lib/store";
import { api, clientAuth } from "@/lib/firebase-client";

export function Settings({
  demo,
  onNotice,
  requests,
  requestLimit,
  loading = false,
  loadError = false,
}: {
  demo: boolean;
  onNotice: (s: string) => void;
  requests: number;
  requestLimit: number;
  loading?: boolean;
  loadError?: boolean;
}) {
  const { theme, setTheme } = useUI();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [telegramLink, setTelegramLink] = useState("");
  const telegram = useQuery({
    queryKey: ["telegram-status"],
    queryFn: async () => {
      const status = await api<TelegramStatus>("/api/telegram");
      if (status.localPolling && telegramLink && !status.connected) {
        await api<{ received?: number; busy?: boolean }>("/api/telegram/poll", {
          method: "POST",
        });
        return api<TelegramStatus>("/api/telegram");
      }
      return status;
    },
    enabled: !demo && Boolean(user),
    refetchInterval: telegramLink ? 2500 : false,
  });
  const connectTelegram = useMutation({
    mutationFn: () => api<{ url: string }>("/api/telegram", { method: "POST" }),
    onSuccess: ({ url }) => setTelegramLink(url),
  });
  const disconnectTelegram = useMutation({
    mutationFn: () => api<{ ok: boolean }>("/api/telegram", { method: "DELETE" }),
    onSuccess: async () => {
      setTelegramLink("");
      await queryClient.invalidateQueries({ queryKey: ["telegram-status"] });
    },
  });
  useEffect(() => {
    if (telegram.data?.connected) setTelegramLink("");
  }, [telegram.data?.connected]);
  const reset = useDemo((s) => s.reset);
  const [deleting, setDeleting] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordDialog, setPasswordDialog] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState({
    current: false,
    next: false,
    confirm: false,
  });
  const passwordAccount = user?.providerData.some((provider) => provider.providerId === "password");
  function openPasswordDialog() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordError("");
    setPasswordVisible({ current: false, next: false, confirm: false });
    setPasswordDialog(true);
  }
  function closePasswordDialog() {
    if (passwordBusy) return;
    setPasswordDialog(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordError("");
    setPasswordVisible({ current: false, next: false, confirm: false });
  }
  async function changePassword() {
    setPasswordError("");
    if (!user?.email) return;
    if (newPassword.length < 6) {
      setPasswordError("Choose a password with at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("The new passwords don’t match.");
      return;
    }
    setPasswordBusy(true);
    try {
      if (passwordAccount) {
        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(user, credential);
        await updatePassword(user, newPassword);
      } else {
        const credential = EmailAuthProvider.credential(user.email, newPassword);
        await linkWithCredential(user, credential);
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordVisible({ current: false, next: false, confirm: false });
      setPasswordDialog(false);
      onNotice(passwordAccount ? "Your password has been updated." : "Password sign-in is ready.");
    } catch (cause) {
      const code = (cause as { code?: string }).code;
      setPasswordError(
        code === "auth/wrong-password" || code === "auth/invalid-credential"
          ? "The current password is incorrect."
          : code === "auth/email-already-in-use" || code === "auth/credential-already-in-use"
            ? "This email already has a separate account with a password. Sign in to that account to manage its password."
            : code === "auth/weak-password"
              ? "Choose a stronger password with at least 6 characters."
              : code === "auth/requires-recent-login"
                ? "For security, sign out and back in, then try again."
                : "Couldn’t update your password. Please try again.",
      );
    } finally {
      setPasswordBusy(false);
    }
  }
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
            <div className="password-settings-summary">
              <div className="settings-info">
                <KeyRound size={17} />
                <span>
                  {passwordAccount
                    ? "You can sign in with your email and password."
                    : "Add a password to sign in with email while keeping your existing sign-in method."}
                </span>
              </div>
              <Button
                variant="outlined"
                startIcon={<KeyRound size={16} />}
                onClick={openPasswordDialog}
              >
                {passwordAccount ? "Change password" : "Set a password"}
              </Button>
              {passwordAccount && (
                <button
                  className="text-link password-reset-link"
                  onClick={async () => {
                    try {
                      if (!user?.email) throw new Error("No account email is available.");
                      await sendPasswordResetEmail(clientAuth(), user.email);
                      onNotice("Password reset link sent. Check your inbox.");
                    } catch {
                      onNotice("Couldn’t send the reset email. Please try again later.");
                    }
                  }}
                >
                  Forgot your current password? Send a reset link
                </button>
              )}
            </div>
          )}
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
        <section className="settings-card telegram-settings-card">
          <h3>Telegram notifications</h3>
          <p>Get a private message for each new reply, with its category and a short summary.</p>
          {demo ? (
            <Link href="/sign-up" className="text-link">
              Create an account to connect Telegram ↗
            </Link>
          ) : telegram.isLoading ? (
            <p className="small muted" role="status">
              Checking your Telegram connection…
            </p>
          ) : telegram.isError ? (
            <Alert severity="error">
              Telegram connection status couldn’t load. Try refreshing.
            </Alert>
          ) : !telegram.data?.configured ? (
            <div className="settings-info">
              <Send size={17} />
              <span>The bot has not been configured for this deployment yet.</span>
            </div>
          ) : telegram.data.connected ? (
            <div className="telegram-settings-actions">
              <div className="settings-info telegram-connected">
                <span className="telegram-status-dot" />
                <span>
                  Connected to @{telegram.data.botUsername}. Older imported emails won’t send
                  alerts.
                </span>
              </div>
              <Button
                variant="outlined"
                size="small"
                startIcon={<Unplug size={15} />}
                disabled={disconnectTelegram.isPending}
                onClick={() => disconnectTelegram.mutate()}
              >
                {disconnectTelegram.isPending ? "Disconnecting…" : "Disconnect Telegram"}
              </Button>
              {disconnectTelegram.isError && (
                <Alert severity="error">Couldn’t disconnect Telegram. Please try again.</Alert>
              )}
            </div>
          ) : (
            <div className="telegram-settings-actions">
              {telegramLink ? (
                <div className="telegram-link-prompt">
                  <div className="telegram-link-copy">
                    <span className="telegram-step-number">2</span>
                    <div>
                      <strong>Finish in Telegram</strong>
                      <p>
                        Open the private bot link below, then tap <b>Start</b>. Replylane will
                        connect your account automatically.
                      </p>
                    </div>
                  </div>
                  <a
                    href={telegramLink}
                    target="_blank"
                    rel="noreferrer"
                    className="telegram-open-link"
                  >
                    <Send size={16} />
                    Open Telegram &amp; press Start
                    <span aria-hidden="true">↗</span>
                  </a>
                  <p className="telegram-link-expiry">This one-time link expires in 10 minutes.</p>
                </div>
              ) : (
                <>
                  <div className="telegram-how-to">
                    <span className="telegram-step-number">1</span>
                    <p>
                      Create a private connection link. Telegram will open from that link and
                      connect your account when you press <b>Start</b>.
                    </p>
                  </div>
                  <Button
                    variant="outlined"
                    startIcon={<Send size={15} />}
                    disabled={connectTelegram.isPending}
                    onClick={() => connectTelegram.mutate()}
                  >
                    {connectTelegram.isPending ? "Creating your link…" : "Create Telegram link"}
                  </Button>
                </>
              )}
              {connectTelegram.isError && (
                <Alert severity="error">{(connectTelegram.error as Error).message}</Alert>
              )}
            </div>
          )}
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
      <Dialog open={passwordDialog} onClose={closePasswordDialog} maxWidth="xs" fullWidth>
        <DialogTitle>{passwordAccount ? "Change your password" : "Set a password"}</DialogTitle>
        <DialogContent className="password-dialog-content">
          <p>
            {passwordAccount
              ? "Enter your current password and choose a new one."
              : "Choose a password for email sign-in. Your existing sign-in method will continue to work."}
          </p>
          {passwordAccount && (
            <TextField
              fullWidth
              size="small"
              type={passwordVisible.current ? "text" : "password"}
              label="Current password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        edge="end"
                        aria-label={
                          passwordVisible.current
                            ? "Hide current password"
                            : "Show current password"
                        }
                        onClick={() =>
                          setPasswordVisible((state) => ({ ...state, current: !state.current }))
                        }
                      >
                        {passwordVisible.current ? <EyeOff size={18} /> : <Eye size={18} />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
          )}
          <TextField
            fullWidth
            size="small"
            type={passwordVisible.next ? "text" : "password"}
            label="New password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      edge="end"
                      aria-label={passwordVisible.next ? "Hide new password" : "Show new password"}
                      onClick={() =>
                        setPasswordVisible((state) => ({ ...state, next: !state.next }))
                      }
                    >
                      {passwordVisible.next ? <EyeOff size={18} /> : <Eye size={18} />}
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
          <TextField
            fullWidth
            size="small"
            type={passwordVisible.confirm ? "text" : "password"}
            label="Confirm new password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      edge="end"
                      aria-label={
                        passwordVisible.confirm ? "Hide confirmation" : "Show confirmation"
                      }
                      onClick={() =>
                        setPasswordVisible((state) => ({ ...state, confirm: !state.confirm }))
                      }
                    >
                      {passwordVisible.confirm ? <EyeOff size={18} /> : <Eye size={18} />}
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
          {passwordError && <Alert severity="error">{passwordError}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={closePasswordDialog} disabled={passwordBusy}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => void changePassword()}
            disabled={
              passwordBusy ||
              (Boolean(passwordAccount) && !currentPassword) ||
              !newPassword ||
              !confirmPassword
            }
          >
            {passwordBusy ? "Saving…" : passwordAccount ? "Update password" : "Set password"}
          </Button>
        </DialogActions>
      </Dialog>
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

type TelegramStatus = {
  configured: boolean;
  connected: boolean;
  localPolling: boolean;
  botUsername: string | null;
};
