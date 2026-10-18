"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  ChevronDown,
  Globe2,
  Mail,
  ShieldCheck,
  Sparkles,
  Inbox,
  Video,
  CircleCheck,
  Menu,
  X,
} from "lucide-react";
import { Brand, TelegramBrandMark, ThemeToggle } from "@/components/brand";
import { useAuth } from "@/components/providers";
import { api } from "@/lib/firebase-client";

interface TelegramStatus {
  configured: boolean;
  connected: boolean;
  botUsername?: string;
}

const faqs = [
  [
    "Does Replylane change anything in my inbox?",
    "No. Gmail and Microsoft connections request read-only access. IMAP mailboxes are opened read-only. Replylane organizes its own workspace; it does not send, delete, archive, or mark your emails as read.",
  ],
  [
    "Which email providers can I connect?",
    "Gmail and Outlook / Microsoft 365 use secure sign-in. Yahoo, iCloud, Fastmail, and custom-domain mail use an encrypted IMAP connection. You can also import an .eml file from another provider. Live connections require the deployment owner to configure the services first.",
  ],
  [
    "Can I start with only new emails?",
    "Yes. Choose New emails only when connecting, or bring in the last 30 or 60 days. Replylane checks for new messages on its scheduled sync. Large imports are processed gradually within the shared AI budget.",
  ],
  [
    "What happens if the AI gets something wrong?",
    "Uncertain results go to Needs review. Every application shows a confidence estimate, summary, and original excerpt. You can correct its status, add a note, or open the message in your email provider. Confidence is an estimate, not a guarantee.",
  ],
  [
    "Is it free to use?",
    "Create an account to connect your inbox and organize application replies. Replylane is an open-source project you can deploy yourself. Live use depends on your email, hosting, database, and processing provider allowances; those services may have limits or costs.",
  ],
];

export default function Landing() {
  const { user, loading: authLoading } = useAuth();
  const telegramStatus = useQuery({
    queryKey: ["telegram-status"],
    queryFn: () => api<TelegramStatus>("/api/telegram"),
    enabled: Boolean(user),
    staleTime: 60_000,
  });
  const workspaceHref = user ? "/app" : "/sign-up";
  const telegramConnected = Boolean(
    telegramStatus.data?.configured && telegramStatus.data.connected,
  );
  const telegramUnavailable = Boolean(
    user && telegramStatus.data && !telegramStatus.data.configured,
  );
  const accountInitial = (user?.displayName || user?.email || "M").slice(0, 1).toUpperCase();
  const [open, setOpen] = useState<number | null>(0);
  const [mobile, setMobile] = useState(false);
  const [preview, setPreview] = useState("en");
  return (
    <div className="landing">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="marketing-header wrap">
        <Brand />
        <nav
          className={mobile ? "marketing-nav mobile-open" : "marketing-nav"}
          aria-label="Main navigation"
        >
          <a href="#how-it-works" onClick={() => setMobile(false)}>
            How it works
          </a>
          <a href="#made-for-you" onClick={() => setMobile(false)}>
            Made for you
          </a>
          <a href="#privacy" onClick={() => setMobile(false)}>
            Your privacy
          </a>
        </nav>
        <div className="nav-actions">
          <ThemeToggle />
          {!authLoading &&
            (user ? (
              <Link className="nav-account" href="/app">
                <span className="nav-account-avatar">{accountInitial}</span>
                <span>My workspace</span>
                <ArrowUpRight size={15} />
              </Link>
            ) : (
              <>
                <Link className="nav-login" href="/sign-in">
                  Log in
                </Link>
                <Link className="button button-dark button-small" href="/sign-up">
                  Get started <ArrowUpRight size={16} />
                </Link>
              </>
            ))}
          <button
            className="icon-button mobile-menu"
            aria-label="Toggle menu"
            onClick={() => setMobile(!mobile)}
          >
            {mobile ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      <main id="main">
        <section className="hero wrap">
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="tiny-spark">✳</span> LESS INBOX. MORE POSSIBILITY.
            </span>
            <h1>
              Your next chapter.
              <br />
              <span>All in one place.</span>
            </h1>
            <p>
              You put yourself out there.
              <br className="desktop-break" /> We make sense of what comes back.
            </p>
            <p className="hero-description">
              Turn scattered job application emails into a clear picture of what’s next. Interviews,
              updates, and offers — thoughtfully organized with AI.
            </p>
            <div className="hero-actions">
              <Link href={workspaceHref} className="button button-dark">
                {user ? "Go to your workspace" : "Find your clarity"} <ArrowUpRight size={19} />
              </Link>
            </div>
            <div className="hero-footnote">
              <ShieldCheck size={15} />
              <span>Read-only access</span>
              <span className="dot-separator">·</span>
              <span>Your inbox stays yours</span>
            </div>
          </div>
          <div className="hero-art" aria-label="Illustrative application board">
            <div className="art-orbit orbit-one" />
            <div className="art-orbit orbit-two" />
            <span className="floating-star star-one">✳</span>
            <span className="floating-star star-two">✧</span>
            <div className="incoming-mail">
              <div className="mini-icon">
                <Mail size={17} />
              </div>
              <div>
                <strong>A new reply.</strong>
                <span>A new possibility.</span>
              </div>
              <span className="notification-dot" />
            </div>
            <div className="preview-window">
              <div className="preview-top">
                <span className="window-dots">
                  <i />
                  <i />
                  <i />
                </span>
                <span>your next chapter</span>
                <ShieldCheck size={13} />
              </div>
              <div className="preview-body">
                <div className="preview-side">
                  <span className="preview-symbol">
                    <ArrowUpRight />
                  </span>
                  <span className="preview-side-item active">
                    <Inbox size={15} />
                  </span>
                  <span className="preview-side-item">
                    <Video size={15} />
                  </span>
                  <span className="preview-side-item">
                    <CircleCheck size={15} />
                  </span>
                  <span className="preview-side-bottom">D</span>
                </div>
                <div className="preview-content">
                  <div className="preview-greeting">
                    A little more clarity. <span>✧</span>
                  </div>
                  <div className="preview-subtitle">Good things are moving forward.</div>
                  <div className="preview-stats">
                    <div>
                      <strong>12</strong>
                      <span>applications</span>
                    </div>
                    <div>
                      <strong>
                        4<span>↗</span>
                      </strong>
                      <span>next steps</span>
                    </div>
                    <div>
                      <strong>
                        1<span>✧</span>
                      </strong>
                      <span>offer</span>
                    </div>
                  </div>
                  <div className="mini-board">
                    <div>
                      <span className="mini-lane-label">
                        <i />
                        Received <b>2</b>
                      </span>
                      <MiniCard
                        letter="F"
                        company="Figma"
                        role="Software Engineer"
                        caption="Application received"
                      />
                      <MiniCard
                        letter="P"
                        company="Personio"
                        role="React Developer"
                        caption="Bewerbung erhalten"
                      />
                    </div>
                    <div>
                      <span className="mini-lane-label purple">
                        <i />
                        Moving forward <b>2</b>
                      </span>
                      <MiniCard
                        letter="L"
                        company="Linear"
                        role="Frontend Engineer"
                        caption="Interview invitation"
                        featured
                      />
                      <MiniCard
                        letter="V"
                        company="Vercel"
                        role="Design Engineer"
                        caption="Take-home challenge"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="offer-note">
              <span className="offer-note-icon">
                <Check size={20} />
              </span>
              <div>
                <strong>That’s an offer.</strong>
                <span>One step closer to your next chapter.</span>
              </div>
              <span>✧</span>
            </div>
            <div className="art-caption">
              A calmer way to job hunt <span>↗</span>
            </div>
          </div>
        </section>
        <section className="compatibility wrap">
          <span>YOUR INBOX, YOUR CHOICE</span>
          <div>
            <span className="provider-word">
              <span className="google-g">M</span> Gmail
            </span>
            <span className="provider-word">
              <span className="outlook-logo">▦</span> Outlook
            </span>
            <span className="provider-word">
              <span className="icloud-logo">☁</span> iCloud
            </span>
            <span className="provider-word yahoo-word">yahoo!</span>
            <span className="provider-word fastmail-word">Fastmail</span>
            <span className="compatibility-more">+ custom IMAP</span>
          </div>
        </section>
        <section className="section wrap how-section" id="how-it-works">
          <div className="section-heading">
            <span className="eyebrow">A LITTLE ORDER GOES A LONG WAY</span>
            <h2>
              From inbox overload
              <br />
              to your next move.
            </h2>
            <p>Less searching, second-guessing, and opening the same email twice.</p>
          </div>
          <div className="steps">
            <article>
              <span className="step-number">
                01 <span>—</span>
              </span>
              <div className="step-visual connect-visual">
                <Mail />
                <span className="connection-line" />
                <span className="small-brand-mark">
                  <ArrowUpRight />
                </span>
              </div>
              <h3>Bring your inbox along.</h3>
              <p>
                Connect your email and choose where to start. Just new replies, or a little recent
                history.
              </p>
            </article>
            <article>
              <span className="step-number">
                02 <span>—</span>
              </span>
              <div className="step-visual sort-visual">
                <span>
                  <i className="status-dot interview" />
                  Interview
                </span>
                <span>
                  <i className="status-dot offer" />
                  Offer
                </span>
                <Sparkles size={20} />
              </div>
              <h3>Let the replies find their place.</h3>
              <p>
                AI identifies application responses and sorts them by what they actually mean,
                across languages.
              </p>
            </article>
            <article>
              <span className="step-number">
                03 <span>↗</span>
              </span>
              <div className="step-visual next-visual">
                <CircleCheck size={22} />
                <div>
                  <strong>Pick a time to meet</strong>
                  <span>Your next step, made clear</span>
                </div>
              </div>
              <h3>Focus on what comes next.</h3>
              <p>
                See the important details, find your next action, and keep moving toward the right
                role.
              </p>
            </article>
          </div>
          <div className={`telegram-promo${telegramConnected ? " is-connected" : ""}`}>
            <span className="telegram-promo-icon">
              <TelegramBrandMark />
            </span>
            <div>
              <strong>
                {telegramConnected
                  ? "Telegram alerts are on"
                  : telegramUnavailable
                    ? "Telegram alerts aren’t enabled here yet."
                    : "New replies, straight to Telegram."}
              </strong>
              <p>
                {telegramConnected
                  ? `Connected to @${telegramStatus.data?.botUsername || "Replylane bot"}. New replies arrive with their category and a short summary; older imports stay quiet.`
                  : telegramUnavailable
                    ? "This deployment needs Telegram bot settings before accounts can connect notifications."
                    : "Connect the bot from Settings to get a private message for each newly processed reply, with the company, category, and a short summary. Older imports stay quiet."}
              </p>
            </div>
            <Link href={user ? "/app/settings" : workspaceHref} className="telegram-promo-link">
              {telegramConnected
                ? "Manage alerts"
                : telegramUnavailable
                  ? "Open workspace"
                  : user
                    ? "Connect Telegram"
                    : "Get started"}{" "}
              <ArrowRight size={15} />
            </Link>
          </div>
        </section>
        <section className="language-section" id="made-for-you">
          <div className="wrap language-layout">
            <div>
              <span className="eyebrow">OPPORTUNITY SPEAKS MANY LANGUAGES</span>
              <h2>
                Different languages.
                <br />
                The same clarity.
              </h2>
              <p>
                A reply from Berlin. An interview in Tehran. An opportunity a little further from
                home. Keep the original message, with an English summary that helps you see your
                next step.
              </p>
              <div className="language-pills" role="group" aria-label="Preview email language">
                {[
                  ["en", "English"],
                  ["fa", "فارسی"],
                  ["de", "Deutsch"],
                ].map(([code, label]) => (
                  <button
                    key={code}
                    lang={code}
                    className={preview === code ? "selected" : ""}
                    onClick={() => setPreview(code)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="language-note">
                <Globe2 size={15} /> Built with multilingual applications in mind
              </span>
            </div>
            <div className="translation-card">
              <div className="translation-header">
                <span className="company-avatar violet">L</span>
                <div>
                  <strong>
                    {preview === "fa"
                      ? "تیم جذب تپسی"
                      : preview === "de"
                        ? "Personio Recruiting"
                        : "Linear Recruiting"}
                  </strong>
                  <span>to you · illustrative example</span>
                </div>
                <span className="language-tag">{preview.toUpperCase()}</span>
              </div>
              <div
                className="translation-original"
                dir={preview === "fa" ? "rtl" : "ltr"}
                lang={preview}
              >
                <h4>
                  {preview === "fa"
                    ? "دعوت به مصاحبه"
                    : preview === "de"
                      ? "Wir möchten dich kennenlernen"
                      : "We'd love to meet you"}
                </h4>
                <p>
                  {preview === "fa"
                    ? "دانیل عزیز، از آشنایی با تجربیات شما خوشحال شدیم. مایلیم شما را به یک جلسه مصاحبه فنی دعوت کنیم."
                    : preview === "de"
                      ? "Dein Profil hat uns überzeugt. Wir möchten dich gerne zu einem ersten Gespräch mit unserem Team einladen."
                      : "Your experience caught our attention. We'd love to invite you to an introductory conversation with our team."}
                </p>
              </div>
              <div className="translation-summary">
                <span>
                  <Sparkles size={14} /> THE PART THAT MATTERS
                </span>
                <p>You’re invited to an interview. Reply with a time that works for you.</p>
                <span className="status-badge interview">
                  <span />
                  Interview invitation <ArrowUpRight size={13} />
                </span>
              </div>
            </div>
          </div>
        </section>
        <section className="section wrap privacy-section" id="privacy">
          <div className="privacy-emblem">
            <ShieldCheck size={44} strokeWidth={1.2} />
            <span>✳</span>
          </div>
          <div>
            <span className="eyebrow">A WORKSPACE YOU CAN FEEL GOOD ABOUT</span>
            <h2>
              Your job search is personal.
              <br />
              It should stay that way.
            </h2>
            <p>
              Read-only connections. Encrypted credentials. Clear consent before email text is sent
              to the AI provider. Disconnect at any time, and delete your workspace when you’re
              done.
            </p>
            <Link href="/privacy" className="text-link">
              The details, in plain language <ArrowRight size={16} />
            </Link>
          </div>
          <div className="privacy-checks">
            <span>
              <Check size={17} /> No sending or deleting emails
            </span>
            <span>
              <Check size={17} /> No AI keys in your browser
            </span>
            <span>
              <Check size={17} /> You can correct every decision
            </span>
            <span>
              <Check size={17} /> You control when syncing stops
            </span>
          </div>
        </section>
        <section className="faq-section wrap">
          <div>
            <span className="eyebrow">A FEW THINGS YOU MIGHT BE WONDERING</span>
            <h2>
              Good questions.
              <br />
              Straight answers.
            </h2>
          </div>
          <div className="faq-list">
            {faqs.map(([q, a], i) => (
              <article key={q}>
                <button aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
                  {q}
                  <ChevronDown size={19} className={open === i ? "rotated" : ""} />
                </button>
                {open === i && <p>{a}</p>}
              </article>
            ))}
          </div>
        </section>
        <section className="final-cta wrap">
          <span className="cta-spark">✳</span>
          <span className="eyebrow">MAKE ROOM FOR WHAT’S NEXT</span>
          <h2>
            You’ve done the applying.
            <br />
            Let’s make sense of the replies.
          </h2>
          <Link href={workspaceHref} className="button button-dark">
            {user ? "Open your workspace" : "Create your account"} <ArrowUpRight size={18} />
          </Link>
          <span className="cta-footnote">Your workspace is private to your account.</span>
        </section>
      </main>
      <footer className="marketing-footer wrap">
        <Brand />
        <span>A little clarity for your next chapter.</span>
        <div>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <span>© {new Date().getFullYear()} Replylane</span>
        </div>
      </footer>
    </div>
  );
}
function MiniCard({
  letter,
  company,
  role,
  caption,
  featured = false,
}: {
  letter: string;
  company: string;
  role: string;
  caption: string;
  featured?: boolean;
}) {
  return (
    <div className={`mini-card ${featured ? "featured" : ""}`}>
      <div>
        <span className={`mini-company ${company.toLowerCase()}`}>{letter}</span>
        <strong>{company}</strong>
        <span>···</span>
      </div>
      <h4>{role}</h4>
      <span className={`mini-tag ${featured ? "interview" : ""}`}>
        {featured && <Video size={10} />} {caption}
      </span>
      <div className="mini-card-date">
        Oct 21 <span>↗</span>
      </div>
    </div>
  );
}
