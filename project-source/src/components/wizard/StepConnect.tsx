import { useEffect, useState } from "react";
import { ArrowLeft, Check, Smartphone, Send } from "lucide-react";
import { sse } from "@/lib/whatsappApi";
import { toast } from "sonner";

interface Props {
  sessionId: string;
  connected: boolean;
  onConnected: () => void;
  onBack: () => void;
  onStart: () => void;
}

export function StepConnect({ sessionId, connected, onConnected, onBack, onStart }: Props) {
  const [qr, setQr] = useState<string>("");

  useEffect(() => {
    const close = sse(sessionId, "qr", {
      qr: (d: { qr: string }) => setQr(d.qr),
      connected: () => onConnected(),
      error: (d: { message: string }) => toast.error(d.message),
    });
    return close;
  }, [sessionId, onConnected]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-6">
        <div className="bg-card rounded-2xl border border-border p-8 shadow-sm">
          <h2 className="text-2xl font-bold mb-1">Connect WhatsApp</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Open WhatsApp on your phone → Settings → Linked devices → Link a device.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-8 items-center">
            <div className="relative">
              <div className={[
                "aspect-square rounded-2xl bg-background border border-border p-3 grid place-items-center transition-all",
                connected ? "opacity-20 grayscale" : "",
              ].join(" ")}>
                {qr ? (
                  <img src={qr} alt="WhatsApp QR" className="w-full h-full object-contain" />
                ) : (
                  <div className="size-full bg-muted rounded animate-pulse" />
                )}
              </div>
              {connected && (
                <div className="absolute inset-0 grid place-items-center">
                  <div className="size-20 rounded-full bg-primary text-primary-foreground grid place-items-center shadow-lg">
                    <Check className="size-10" strokeWidth={3} />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-5">
              <Step n={1} title="Open WhatsApp" desc="On your phone, tap the menu → Linked devices." />
              <Step n={2} title="Scan QR" desc="Point your camera at the code on the left." />
              <Step n={3} title="Wait" desc="Stay on this page until you see a green check." />

              <div className="pt-3">
                {connected ? (
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-success-bg text-success text-sm font-bold">
                    <span className="size-2 bg-success rounded-full" /> Connected
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted text-muted-foreground text-sm font-bold">
                    <span className="size-2 bg-warning rounded-full animate-pulse" />
                    Waiting for scan…
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
            The QR is streamed live from your local backend. It rotates automatically.
          </p>
        </div>

        <div className="flex justify-between gap-3">
          <button onClick={onBack} className="px-5 py-3 bg-card border border-border font-bold rounded-xl hover:bg-muted transition-colors flex items-center gap-2">
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

function Step({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 size-7 rounded-full bg-foreground text-background font-bold text-xs grid place-items-center">{n}</div>
      <div>
        <p className="text-sm font-bold">{title}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}
