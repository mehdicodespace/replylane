"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { TextField, Button, Alert, CircularProgress } from "@mui/material";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
} from "firebase/auth";
import { ArrowLeft, ArrowUpRight, ShieldCheck, Eye, EyeOff, Check } from "lucide-react";
import { clientAuth, firebaseConfigured } from "@/lib/firebase-client";
import { Brand, ThemeToggle } from "./brand";
import { useAuth } from "./providers";

type Mode = "sign-in" | "sign-up" | "forgot-password";
const schema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string(),
  name: z.string(),
});
type Values = z.infer<typeof schema>;
export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [visible, setVisible] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const message = sessionStorage.getItem("replylane-auth-notice");
    if (message) {
      setNotice(message);
      sessionStorage.removeItem("replylane-auth-notice");
    }
  }, []);
  useEffect(() => {
    if (mode !== "forgot-password" && !authLoading && user) router.replace("/app");
  }, [authLoading, mode, router, user]);
  const {
    register,
    handleSubmit,
    setError: fieldError,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "", name: "" },
  });
  const title =
    mode === "sign-up"
      ? "A fresh start,\nwith a little clarity."
      : mode === "forgot-password"
        ? "Let’s get you\nback in."
        : "Good to have\nyou back.";
  if (mode !== "forgot-password" && (authLoading || user)) {
    return (
      <main className="auth-page">
        <div className="auth-main auth-redirect-state">
          <Brand />
          <p>Opening your workspace…</p>
        </div>
      </main>
    );
  }
  const friendly = (e: unknown) => {
    const code = (e as { code?: string })?.code || "";
    if (
      code.includes("invalid-credential") ||
      code.includes("wrong-password") ||
      code.includes("user-not-found")
    )
      return "The email or password isn't right. Check your details and try again.";
    if (code.includes("email-already-in-use"))
      return "An account already uses this email. Try signing in or resetting your password.";
    if (code.includes("popup-closed")) return "Sign-in was closed. Try again when you're ready.";
    if (code.includes("too-many-requests"))
      return "There have been too many attempts. Please try again later.";
    if (code.includes("network")) return "Please check your connection and try again.";
    if (code.includes("operation-not-allowed") || code.includes("unauthorized-domain"))
      return "The deployment owner needs to finish configuring this sign-in option.";
    return e instanceof Error && !code ? e.message : "Sign-in couldn't finish. Please try again.";
  };
  async function submit(v: Values) {
    setError("");
    if (mode !== "forgot-password" && v.password.length < (mode === "sign-up" ? 10 : 1)) {
      fieldError("password", {
        message: mode === "sign-up" ? "Use at least 10 characters." : "Enter your password.",
      });
      return;
    }
    if (mode === "sign-up" && !v.name.trim()) {
      fieldError("name", { message: "What should we call you?" });
      return;
    }
    setBusy(true);
    try {
      if (mode === "forgot-password") {
        try {
          await sendPasswordResetEmail(clientAuth(), v.email);
        } catch (e) {
          const code = (e as { code?: string }).code;
          if (code !== "auth/user-not-found") throw e;
        }
        setSuccess(true);
      } else if (mode === "sign-up") {
        const result = await createUserWithEmailAndPassword(clientAuth(), v.email, v.password);
        await updateProfile(result.user, { displayName: v.name.trim() });
        await sendEmailVerification(result.user);
        router.push("/app");
      } else {
        await signInWithEmailAndPassword(clientAuth(), v.email, v.password);
        router.push("/app");
      }
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  }
  async function google() {
    setError("");
    setBusy(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(clientAuth(), provider);
      router.push("/app");
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <div className="auth-main">
        <header>
          <Brand />
          <ThemeToggle />
        </header>
        <div className="auth-form-wrap">
          <Link
            className="text-link auth-back"
            href={mode === "forgot-password" ? "/sign-in" : "/"}
          >
            <ArrowLeft size={16} />
            {mode === "forgot-password" ? "Back to sign in" : "Back to home"}
          </Link>
          <span className="eyebrow">
            {mode === "sign-up"
              ? "YOUR NEXT CHAPTER STARTS HERE"
              : mode === "forgot-password"
                ? "ONE LESS THING TO WORRY ABOUT"
                : "YOUR WORKSPACE IS WAITING"}
          </span>
          <h1>
            {title.split("\n").map((line, i) => (
              <span key={i}>
                {line}
                <br />
              </span>
            ))}
          </h1>
          <p>
            {mode === "sign-up"
              ? "A calmer home for your applications, interviews, and what’s next."
              : mode === "forgot-password"
                ? "Enter your email and we’ll send you a password reset link."
                : "Sign in to see where things stand — and where you’re headed."}
          </p>
          {!firebaseConfigured && (
            <Alert severity="info" className="auth-alert">
              Live accounts aren’t configured yet. Account sign-in is unavailable until the
              deployment owner finishes setup.
            </Alert>
          )}
          {error && (
            <Alert severity="error" className="auth-alert">
              {error}
            </Alert>
          )}
          {notice && mode === "sign-in" && (
            <Alert severity="success" className="auth-alert">
              {notice}
            </Alert>
          )}
          {success ? (
            <div className="reset-success" role="status">
              <span>
                <Check size={24} />
              </span>
              <h3>Check your inbox.</h3>
              <p>
                If an account exists for that address, a reset link is on its way. Check your spam
                folder too.
              </p>
              <Link href="/sign-in" className="button button-dark">
                Back to sign in <ArrowRightIcon />
              </Link>
            </div>
          ) : (
            <>
              {mode !== "forgot-password" && (
                <>
                  <Button
                    variant="outlined"
                    fullWidth
                    onClick={google}
                    disabled={busy || !firebaseConfigured}
                    className="google-auth"
                  >
                    <GoogleMark /> Continue with Google
                  </Button>
                  <div className="auth-divider">
                    <span />
                    or use your email
                    <span />
                  </div>
                </>
              )}
              <form onSubmit={handleSubmit(submit)} noValidate className="auth-form">
                {mode === "sign-up" && (
                  <TextField
                    label="Your name"
                    autoComplete="name"
                    {...register("name")}
                    error={!!errors.name}
                    helperText={errors.name?.message}
                    fullWidth
                  />
                )}
                <TextField
                  label="Email address"
                  type="email"
                  autoComplete="email"
                  {...register("email")}
                  error={!!errors.email}
                  helperText={errors.email?.message}
                  fullWidth
                />
                {mode !== "forgot-password" && (
                  <div className="password-field">
                    <TextField
                      label="Password"
                      type={visible ? "text" : "password"}
                      autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                      {...register("password")}
                      error={!!errors.password}
                      helperText={
                        errors.password?.message ||
                        (mode === "sign-up"
                          ? "At least 10 characters. Make it your own."
                          : undefined)
                      }
                      fullWidth
                    />
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={visible ? "Hide password" : "Show password"}
                      onClick={() => setVisible(!visible)}
                    >
                      {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                )}
                {mode === "sign-in" && (
                  <Link className="forgot-link" href="/forgot-password">
                    Forgot password?
                  </Link>
                )}
                <Button
                  variant="contained"
                  type="submit"
                  fullWidth
                  disabled={busy || !firebaseConfigured}
                  endIcon={
                    busy ? (
                      <CircularProgress size={16} color="inherit" />
                    ) : (
                      <ArrowUpRight size={18} />
                    )
                  }
                >
                  {mode === "sign-up"
                    ? "Create your workspace"
                    : mode === "forgot-password"
                      ? "Send reset link"
                      : "Sign in"}
                </Button>
              </form>
            </>
          )}
          {mode !== "forgot-password" && (
            <p className="auth-alternate">
              {mode === "sign-in" ? "New to Replylane?" : "Already have a workspace?"}{" "}
              <Link href={mode === "sign-in" ? "/sign-up" : "/sign-in"}>
                {mode === "sign-in" ? "Get started" : "Sign in"}
              </Link>
            </p>
          )}
          {mode === "sign-up" && (
            <p className="auth-terms">
              By creating an account, you agree to our <Link href="/terms">Terms</Link> and{" "}
              <Link href="/privacy">Privacy notice</Link>. Connecting an inbox is a separate,
              optional step.
            </p>
          )}
        </div>
        <footer>
          <ShieldCheck size={15} /> Your next opportunity deserves a little peace of mind.
        </footer>
      </div>
      <aside className="auth-art">
        <div className="auth-art-orbit" />
        <span className="auth-art-spark">✳</span>
        <div className="auth-quote">
          <span className="eyebrow">LESS NOISE. MORE NEXT.</span>
          <h2>
            Behind every reply,
            <br />
            there’s a next step.
          </h2>
          <p>Let’s help you find yours.</p>
          <div className="auth-sample-card">
            <span className="company-avatar violet">L</span>
            <div>
              <strong>You’re invited.</strong>
              <span>Your next conversation is waiting.</span>
            </div>
            <ArrowUpRight size={22} />
          </div>
          <span className="auth-art-caption">A little more clarity for what comes next.</span>
        </div>
        <span className="auth-art-bottom">A LITTLE CLARITY GOES A LONG WAY. ↗</span>
      </aside>
    </main>
  );
}
function ArrowRightIcon() {
  return <ArrowUpRight size={17} />;
}

function GoogleMark() {
  return (
    <svg className="google-auth-mark" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M43.6 24.5c0-1.4-.1-2.9-.4-4.3H24v8.2h11a9.4 9.4 0 0 1-4.2 6.2v5.3h6.8c4-3.7 6-9 6-15.4Z"
      />
      <path
        fill="#34A853"
        d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.8-5.3c-1.9 1.3-4.1 2-6.7 2-5.2 0-9.6-3.5-11.2-8.2H5.8v5.5A20 20 0 0 0 24 44Z"
      />
      <path fill="#FBBC05" d="M12.8 27.6a12 12 0 0 1 0-7.2v-5.5H5.8a20 20 0 0 0 0 18.2l7-5.5Z" />
      <path
        fill="#EA4335"
        d="M24 12.2c3 0 5.6 1 7.7 3l5.9-5.9A19.7 19.7 0 0 0 24 4 20 20 0 0 0 5.8 14.9l7 5.5c1.6-4.7 6-8.2 11.2-8.2Z"
      />
    </svg>
  );
}
