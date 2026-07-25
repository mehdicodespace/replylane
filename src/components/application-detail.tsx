"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Drawer, TextField, Button, MenuItem, Alert } from "@mui/material";
import {
  X,
  Star,
  ExternalLink,
  Sparkles,
  CalendarDays,
  Mail,
  ArrowUpRight,
  Archive,
  Check,
  Clock3,
} from "lucide-react";
import {
  type Application,
  type ApplicationPatch,
  type MailEvent,
  statuses,
  statusLabels,
  displayDate,
} from "@/lib/domain";
import { api } from "@/lib/firebase-client";

export function ApplicationDetail({
  application,
  onClose,
  onPatch,
  demo,
  busy,
}: {
  application: Application | null;
  onClose: () => void;
  onPatch: (id: string, p: ApplicationPatch) => Promise<void>;
  demo: boolean;
  busy: boolean;
}) {
  return (
    <Drawer
      anchor="right"
      open={!!application}
      onClose={onClose}
      slotProps={{ paper: { className: "detail-drawer" } }}
    >
      {application && (
        <Detail
          key={application.id}
          a={application}
          onClose={onClose}
          onPatch={onPatch}
          demo={demo}
          busy={busy}
        />
      )}
    </Drawer>
  );
}
function Detail({
  a,
  onClose,
  onPatch,
  demo,
  busy,
}: {
  a: Application;
  onClose: () => void;
  onPatch: (id: string, p: ApplicationPatch) => Promise<void>;
  demo: boolean;
  busy: boolean;
}) {
  const [notes, setNotes] = useState(a.notes);
  const [deadline, setDeadline] = useState(a.deadline || "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const events = useQuery({
    queryKey: ["events", a.id],
    queryFn: () => api<{ events: MailEvent[] }>(`/api/applications/${a.id}`),
    enabled: !demo,
  });
  async function save(p: ApplicationPatch) {
    try {
      setError("");
      await onPatch(a.id, p);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const timeline = demo
    ? [
        {
          id: a.id,
          subject: a.subject,
          summary: a.summary,
          status: a.aiStatus,
          receivedAt: a.receivedAt,
          excerpt: a.excerpt,
        },
      ]
    : events.data?.events || [];
  return (
    <div className="detail-content">
      <div className="detail-top">
        <span>APPLICATION DETAILS</span>
        <div>
          <button
            className={`icon-button ${a.starred ? "is-starred" : ""}`}
            aria-label={a.starred ? "Unsave application" : "Save application"}
            disabled={busy}
            onClick={() => void save({ starred: !a.starred })}
          >
            <Star size={19} fill={a.starred ? "currentColor" : "none"} />
          </button>
          <button className="icon-button" onClick={onClose} aria-label="Close details">
            <X size={21} />
          </button>
        </div>
      </div>
      <div className="detail-company">
        <span className={`company-avatar ${a.color || "green"}`}>{a.company.slice(0, 1)}</span>
        <div>
          <span>{a.company}</span>
          <h2 dir="auto">{a.role}</h2>
        </div>
      </div>
      <div className="detail-meta">
        <span>
          <CalendarDays size={14} />
          {displayDate(a.receivedAt)}
        </span>
        <span className="language-tag">{a.language.toUpperCase()}</span>
        <span className={`status-badge ${a.status}`}>
          <span />
          {statusLabels[a.status]}
        </span>
      </div>
      {error && <Alert severity="error">{error}</Alert>}
      <section className="detail-summary">
        <div>
          <Sparkles size={16} />
          <strong>A little clarity</strong>
          <span>{Math.round(a.confidence * 100)}% confidence estimate</span>
        </div>
        <p>{a.summary}</p>
        {a.nextAction && (
          <div className="next-action">
            <ArrowUpRight size={18} />
            <div>
              <span>YOUR NEXT STEP</span>
              <p>{a.nextAction}</p>
            </div>
          </div>
        )}
      </section>
      {a.status === "review" && (
        <Alert severity="info">
          This message needs your judgment. Read the original and choose the right status below.
        </Alert>
      )}
      {a.manualStatus && (
        <p className="manual-note">
          <Check size={14} />
          You set this status. AI suggested “{statusLabels[a.aiStatus]}”. Your choice is preserved
          on later replies.
        </p>
      )}
      <section className="detail-section">
        <h3>Make it yours</h3>
        <TextField
          select
          fullWidth
          size="small"
          label="Application status"
          value={a.status}
          onChange={(e) => void save({ status: e.target.value as Application["status"] })}
          disabled={busy}
        >
          {statuses.map((s) => (
            <MenuItem key={s} value={s}>
              {statusLabels[s]}
            </MenuItem>
          ))}
        </TextField>
        <div className="detail-deadline">
          <TextField
            fullWidth
            size="small"
            label="Follow-up / deadline"
            type="date"
            value={deadline}
            onChange={(e) => {
              setDeadline(e.target.value);
              setSaved(false);
            }}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </div>
        <TextField
          multiline
          minRows={3}
          maxRows={8}
          fullWidth
          label="Your private notes"
          placeholder="Interview prep, questions, things to remember…"
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            setSaved(false);
          }}
          slotProps={{ htmlInput: { maxLength: 5000 } }}
        />
        <Button
          variant="outlined"
          size="small"
          disabled={busy}
          onClick={async () => {
            try {
              await onPatch(a.id, { notes, deadline: deadline || null });
              setSaved(true);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
          startIcon={saved ? <Check size={15} /> : undefined}
        >
          {saved ? "Saved" : "Save notes & date"}
        </Button>
      </section>
      <section className="detail-section original-message">
        <h3>
          <Mail size={16} />
          The original reply
        </h3>
        <div className="sender-line">
          <strong dir="auto">{a.sender}</strong>
          <span>{a.senderEmail}</span>
        </div>
        <h4 dir="auto">{a.subject}</h4>
        <blockquote dir="auto">{a.excerpt}</blockquote>
        <p className="muted small">
          Plain-text excerpt. Attachments and remote images are not loaded.
        </p>
        {a.messageUrl ? (
          <a href={a.messageUrl} target="_blank" rel="noopener noreferrer" className="text-link">
            Open original email <ExternalLink size={14} />
          </a>
        ) : (
          <span className="muted small">
            {demo
              ? "Sample message — no real inbox link."
              : "Open your mail app to view the full message."}
          </span>
        )}
      </section>
      <section className="detail-section">
        <h3>
          <Clock3 size={16} />
          Reply history
        </h3>
        {events.isLoading && !demo ? (
          <p className="muted">Loading history…</p>
        ) : events.error ? (
          <p role="alert" className="error-text">
            History could not be loaded. Close and reopen to retry.
          </p>
        ) : (
          timeline.map((event) => (
            <div className="timeline-event" key={event.id}>
              <span className={`status-dot ${event.status}`} />
              <div>
                <span>{displayDate(event.receivedAt)}</span>
                <strong dir="auto">{event.subject}</strong>
                <p>{event.summary}</p>
              </div>
            </div>
          ))
        )}
      </section>
      <Button
        fullWidth
        variant="outlined"
        startIcon={<Archive size={16} />}
        disabled={busy}
        onClick={async () => {
          try {
            await onPatch(a.id, { archived: !a.archived });
            onClose();
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        {a.archived ? "Restore to applications" : "Archive in Replylane"}
      </Button>
      <p className="muted small detail-bottom-note">
        Archiving here only changes your Replylane workspace.
      </p>
    </div>
  );
}
