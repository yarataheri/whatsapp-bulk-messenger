import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { ArrowLeft, Check, Smartphone, Send } from "lucide-react";
import { sse } from "@/lib/whatsappApi";
import { toast } from "sonner";

interface Props {
  sessionId: string;
  connected: boolean;
  onConnectionChange: Dispatch<SetStateAction<boolean>>;
  connectionState: string;
  onConnectionStateChange: Dispatch<SetStateAction<string>>;
  scanEtaSeconds: number | null;
  onScanEtaChange: Dispatch<SetStateAction<number | null>>;
  onBack: () => void;
  onStart: () => void;
}

export function StepConnect({
  sessionId,
  connected,
  onConnectionChange,
  connectionState,
  onConnectionStateChange,
  scanEtaSeconds,
  onScanEtaChange,
  onBack,
  onStart,
}: Props) {
  const [qr, setQr] = useState<string>("");

  // Keep latest setter refs so the SSE effect only depends on `sessionId`
  // and the EventSource is opened EXACTLY ONCE per session.
  const onConnChange = useRef(onConnectionChange);
  const onStateChange = useRef(onConnectionStateChange);
  const onEtaChange = useRef(onScanEtaChange);
  useEffect(() => {
    onConnChange.current = onConnectionChange;
    onStateChange.current = onConnectionStateChange;
    onEtaChange.current = onScanEtaChange;
  }, [onConnectionChange, onConnectionStateChange, onScanEtaChange]);

  // -------- Subscribe to backend SSE (QR + state) ONCE per session --------
  useEffect(() => {
    if (!sessionId) return;
    const close = sse(sessionId, "qr", {
      qr: (d: { qr: string; state?: string; expiresIn?: number }) => {
        if (d.qr) setQr(d.qr);
        onConnChange.current(false);
        onStateChange.current(d.state ?? "QR received — scan it in WhatsApp");
        const ttl =
          typeof d.expiresIn === "number" && d.expiresIn > 0 ? d.expiresIn : 60;
        onEtaChange.current(ttl);
      },
      state: (d: {
        state?: string;
        connected?: boolean;
        etaSeconds?: number;
        qr?: string;
      }) => {
        if (d.qr) setQr(d.qr);
        if (d.state) onStateChange.current(d.state);
        if (typeof d.connected === "boolean") onConnChange.current(d.connected);
        if (typeof d.etaSeconds === "number" && d.etaSeconds > 0) {
          onEtaChange.current(d.etaSeconds);
        }
        if (d.connected) onEtaChange.current(null);
      },
      connected: () => {
        onConnChange.current(true);
        onStateChange.current("Connected — ready to start sending");
        onEtaChange.current(null);
      },
      error: (d: { message: string }) =>
        toast.error(d.message || "Connection error"),
    });
    return close;
  }, [sessionId]);

  // -------- Local countdown ticker --------
  // Decrements the displayed ETA every second. Uses functional state updates
  // so the interval doesn't depend on `scanEtaSeconds` (no per-tick rebuild).
  useEffect(() => {
    if (connected) return;
    const timer = window.setInterval(() => {
      onEtaChange.current((current) => {
        if (current == null) return current;
        if (current <= 1) return 0;
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [connected]);

  const etaLabel = formatEta(scanEtaSeconds);
  const showWaitingForQr = !qr && !connected;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-6">
        <div className="bg-card rounded-2xl border border-border p-8 shadow-sm">
          <h2 className="text-2xl font-bold mb-1">Connect WhatsApp</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Open WhatsApp on your phone → Settings → Linked devices → Link a
            device.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-8 items-center">
            <div className="relative">
              <div
                className={[
                  "aspect-square rounded-2xl bg-background border border-border p-3 grid place-items-center transition-all",
                  connected ? "opacity-20 grayscale" : "",
                ].join(" ")}
              >
                {qr ? (
                  <img
                    src={qr}
                    alt="WhatsApp QR"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-3 text-center px-3">
                    <div className="size-10 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
                    <p className="text-xs text-muted-foreground font-medium">
                      {showWaitingForQr
                        ? "Generating QR code…"
                        : "Waiting…"}
                    </p>
                  </div>
                )}
              </div>

              {/* Countdown badge overlay on the QR */}
              {qr && !connected && etaLabel && (
                <div className="absolute -top-2 -right-2 px-3 py-1.5 rounded-full bg-foreground text-background text-xs font-bold shadow-lg tabular-nums">
                  {etaLabel}
                </div>
              )}

              {connected && (
                <div className="absolute inset-0 grid place-items-center">
                  <div className="size-20 rounded-full bg-primary text-primary-foreground grid place-items-center shadow-lg">
                    <Check className="size-10" strokeWidth={3} />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-5">
              <Step
                n={1}
                title="Open WhatsApp"
                desc="On your phone, tap the menu → Linked devices."
              />
              <Step
                n={2}
                title="Scan QR"
                desc="Point your camera at the code on the left."
              />
              <Step
                n={3}
                title="Wait"
                desc="Stay on this page until you see a green check."
              />

              <div className="rounded-xl border border-border bg-background px-4 py-3 space-y-1">
                <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">
                  Live connection state
                </p>
                <p className="text-sm font-bold text-foreground">
                  {connectionState}
                </p>
                {!connected && qr && etaLabel && (
                  <p className="text-xs text-muted-foreground tabular-nums">
                    Scan this QR within{" "}
                    <span className="font-bold text-foreground">{etaLabel}</span>{" "}
                    — a fresh one will be generated automatically.
                  </p>
                )}
                {!connected && qr && scanEtaSeconds === 0 && (
                  <p className="text-xs text-warning">
                    QR expired — waiting for a new one…
                  </p>
                )}
              </div>

              <div className="pt-3">
                {connected ? (
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-success-bg text-success text-sm font-bold">
                    <span className="size-2 bg-success rounded-full" /> Connected
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted text-muted-foreground text-sm font-bold tabular-nums">
                    <span className="size-2 bg-warning rounded-full animate-pulse" />
                    {qr
                      ? etaLabel
                        ? `Waiting for scan • ${etaLabel} left`
                        : "Waiting for scan…"
                      : "Preparing QR code…"}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <aside className="space-y-6">
        <div className="bg-accent rounded-2xl border border-primary/20 p-6">
          <div className="flex items-center gap-3 mb-2">
            <Smartphone className="size-5 text-primary" />
            <span className="text-sm font-bold">Heads up</span>
          </div>
          <p className="text-xs text-foreground/80 leading-relaxed">
            The QR is streamed live from your local backend. It rotates
            automatically every ~60 seconds until you scan it.
          </p>
        </div>

        <div className="flex justify-between gap-3">
          <button
            onClick={onBack}
            className="px-5 py-3 bg-card border border-border font-bold rounded-xl hover:bg-muted transition-colors flex items-center gap-2"
          >
            <ArrowLeft className="size-4" /> Back
          </button>
          <button
            onClick={onStart}
            disabled={!connected}
            className="px-6 py-3 bg-primary text-primary-foreground font-bold rounded-xl shadow-sm hover:bg-primary-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            Start Sending <Send className="size-4" />
          </button>
        </div>
      </aside>
    </div>
  );
}

function formatEta(seconds: number | null) {
  if (seconds == null || seconds <= 0) return null;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins <= 0) return `${secs}s`;
  return `${mins}m ${secs.toString().padStart(2, "0")}s`;
}

function Step({
  n,
  title,
  desc,
}: {
  n: number;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 size-7 rounded-full bg-foreground text-background font-bold text-xs grid place-items-center">
        {n}
      </div>
      <div>
        <p className="text-sm font-bold">{title}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}
