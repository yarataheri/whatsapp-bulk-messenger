import { useEffect, useRef, useState } from "react";
import { Square } from "lucide-react";
import { sse, stopCampaign } from "@/lib/whatsappApi";
import type { CampaignMessage, CampaignResult, LogEntry } from "./types";

interface Props {
  sessionId: string;
  messages: CampaignMessage[];
  total: number;
  onComplete: (r: CampaignResult) => void;
}

export function StepSending({ sessionId, messages, total, onComplete }: Props) {
  const [sent, setSent] = useState(0);
  const [failed, setFailed] = useState(0);
  const [notWa, setNotWa] = useState(0);
  const [log, setLog] = useState<LogEntry[]>([]);
  const idRef = useRef(0);
  const logBoxRef = useRef<HTMLDivElement>(null);
  const completedRef = useRef(false);

  const processed = sent + failed + notWa;
  const pct = total ? Math.round((processed / total) * 100) : 0;

  useEffect(() => {
    const ts = () =>
      new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

    const close = sse(sessionId, "progress", {
      // backend fires "progress" with running totals
      progress: (d: { sent: number; failed: number; notWa: number; total: number }) => {
        setSent(d.sent ?? 0);
        setFailed(d.failed ?? 0);
        setNotWa(d.notWa ?? 0);
      },
      // backend fires "done" with { success[], failed[], notWa[] }
      done: (d: { success: string[]; failed: { number: string; error: string }[]; notWa: string[] }) => {
        if (completedRef.current) return;
        completedRef.current = true;
        // map to CampaignResult shape the rest of the UI expects
        const result: CampaignResult = {
          total,
          sent: d.success ?? [],
          notWa: d.notWa ?? [],
          failed: (d.failed ?? []).map((f) => ({ number: f.number, reason: f.error })),
        };
        onComplete(result);
      },
      error: (d: { message: string }) => {
        setLog((l) => [
          ...l,
          {
            id: ++idRef.current,
            status: "failed",
            number: "—",
            reason: d.message,
            ts: ts(),
          },
        ]);
      },
    });
    return close;
  }, [sessionId, onComplete, total]);

  useEffect(() => {
    if (logBoxRef.current)
      logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
  }, [log]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-6">
        <div className="bg-card rounded-2xl border border-border p-8 shadow-sm">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            Sending in Progress
            <span className="size-2 bg-accent-info rounded-full animate-pulse" />
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <Stat label="Recipients" value={total} tint="bg-muted" />
            <Stat label="Sent" value={sent} tint="bg-success-bg" textTint="text-success" />
            <Stat label="Failed" value={failed + notWa} tint="bg-destructive-bg" textTint="text-destructive" />
            <Stat label="Remaining" value={Math.max(total - processed, 0)} tint="bg-muted" />
          </div>

          <div className="space-y-2 mb-8">
            <div className="flex justify-between text-sm font-medium">
              <span>Batch Progress</span>
              <span className="text-accent-info font-mono">{pct}%</span>
            </div>
            <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-accent-info rounded-full transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          <div className="border border-border rounded-xl overflow-hidden">
            <div className="bg-muted/60 px-4 py-2 border-b border-border flex justify-between items-center">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                Live activity log
              </span>
              <span className="text-[10px] text-muted-foreground">Auto-scrolling</span>
            </div>
            <div
              ref={logBoxRef}
              className="h-72 overflow-y-auto p-4 font-mono text-sm space-y-2 bg-background"
            >
              {log.length === 0 && (
                <p className="text-muted-foreground italic text-xs">Warming up…</p>
              )}
              {log.map((e) => (
                <LogLine key={e.id} entry={e} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <aside className="space-y-6">
        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
          <h3 className="text-sm font-bold text-muted-foreground uppercase mb-4 tracking-wider">
            Message Sequence
          </h3>
          <ol className="space-y-3">
            {messages.map((m, i) => (
              <li key={m.id} className="flex gap-3">
                <span className="shrink-0 size-7 rounded-lg bg-accent text-accent-foreground font-bold text-xs grid place-items-center">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold capitalize">{m.type}</p>
                  <p className="text-xs text-muted-foreground truncate italic">
                    {m.type === "text" ? `"${m.text}"` : m.fileName}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <button
          onClick={() => stopCampaign(sessionId)}
          className="w-full py-3 bg-destructive-bg hover:bg-destructive/15 text-destructive font-bold rounded-xl border border-destructive/20 transition-colors flex items-center justify-center gap-2"
        >
          <Square className="size-4" fill="currentColor" /> Stop Campaign
        </button>
      </aside>
    </div>
  );
}

function Stat({
  label,
  value,
  tint,
  textTint,
}: {
  label: string;
  value: number;
  tint: string;
  textTint?: string;
}) {
  return (
    <div className={`p-4 rounded-xl ${tint}`}>
      <p className={`text-xs font-semibold uppercase mb-1 ${textTint ?? "text-muted-foreground"}`}>
        {label}
      </p>
      <p className={`text-2xl font-bold font-mono ${textTint ?? "text-foreground"}`}>{value}</p>
    </div>
  );
}

function LogLine({ entry }: { entry: LogEntry }) {
  if (entry.status === "sent")
    return (
      <div className="flex gap-3">
        <span className="text-success">✓</span>
        <span className="text-muted-foreground">[{entry.ts}]</span>
        <span className="text-foreground">
          Sent to <span className="font-bold">{entry.number}</span>
        </span>
      </div>
    );
  if (entry.status === "not_wa")
    return (
      <div className="flex gap-3">
        <span className="text-warning font-bold">!</span>
        <span className="text-muted-foreground">[{entry.ts}]</span>
        <span className="text-warning">
          Not on WhatsApp <span className="font-bold">{entry.number}</span>
        </span>
      </div>
    );
  return (
    <div className="flex gap-3">
      <span className="text-destructive font-bold">✗</span>
      <span className="text-muted-foreground">[{entry.ts}]</span>
      <span className="text-destructive">
        {entry.reason}: <span className="font-bold">{entry.number}</span>
      </span>
    </div>
  );
}