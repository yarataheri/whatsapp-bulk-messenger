import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Toaster, toast } from "sonner";
import { MessageSquare } from "lucide-react";
import { Stepper } from "@/components/wizard/Stepper";
import { StepRecipients } from "@/components/wizard/StepRecipients";
import { StepMessages } from "@/components/wizard/StepMessages";
import { StepConnect } from "@/components/wizard/StepConnect";
import { StepSending } from "@/components/wizard/StepSending";
import { StepResults } from "@/components/wizard/StepResults";
import {
  createSession,
  startCampaign,
  uploadMessages,
  uploadRecipients,
} from "@/lib/whatsappApi";
import type {
  CampaignMessage,
  CampaignResult,
  RecipientMode,
} from "@/components/wizard/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NexusMsg — WhatsApp Bulk Sender" },
      {
        name: "description",
        content:
          "Send sequenced WhatsApp messages to thousands of recipients with live progress tracking and detailed delivery reports.",
      },
      { property: "og:title", content: "NexusMsg — WhatsApp Bulk Sender" },
      {
        property: "og:description",
        content:
          "Send sequenced WhatsApp messages to thousands of recipients with live progress tracking and detailed delivery reports.",
      },
    ],
  }),
  component: Index,
});

function parseManual(t: string): string[] {
  return t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

function Index() {
  const [step, setStep] = useState(1);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Step 1
  const [mode, setMode] = useState<RecipientMode | null>(null);
  const [jsonFile, setJsonFile] = useState<{ name: string; numbers: string[] } | null>(null);
  const [manualText, setManualText] = useState("");

  // Step 2
  const [messages, setMessages] = useState<CampaignMessage[]>([
    { id: crypto.randomUUID(), type: "text", text: "Hello, this is a test message." },
  ]);

  // Step 3
  const [connected, setConnected] = useState(false);
  const [connectionState, setConnectionState] = useState("Waiting to initialize session…");
  const [scanEtaSeconds, setScanEtaSeconds] = useState<number | null>(null);

  // Step 5
  const [result, setResult] = useState<CampaignResult | null>(null);

  const recipients =
    mode === "json" ? jsonFile?.numbers ?? [] : parseManual(manualText);

  const restart = () => {
    setStep(1);
    setSessionId(null);
    setMode(null);
    setJsonFile(null);
    setManualText("");
    setMessages([{ id: crypto.randomUUID(), type: "text", text: "" }]);
    setConnected(false);
    setConnectionState("Waiting to initialize session…");
    setScanEtaSeconds(null);
    setResult(null);
  };

  const goToMessages = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const id = sessionId ?? (await createSession());
      if (!sessionId) setSessionId(id);
      await uploadRecipients(id, recipients);
      setStep(2);
    } catch (e: any) {
      toast.error(`Backend error: ${e.message}. Is the Node server running on the URL in VITE_WA_API_BASE?`);
    } finally {
      setBusy(false);
    }
  };

  const goToConnect = async () => {
    if (!sessionId || busy) return;
    setBusy(true);
    try {
      await uploadMessages(sessionId, messages);
      setStep(3);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const goToSending = async () => {
    if (!sessionId) return;
    try {
      await startCampaign(sessionId);
      setStep(4);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <Toaster position="top-right" richColors />

      <nav className="sticky top-0 z-50 bg-card/80 backdrop-blur border-b border-border px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-10 bg-primary rounded-xl grid place-items-center shadow-sm">
              <MessageSquare className="size-5 text-primary-foreground" strokeWidth={2.5} />
            </div>
            <div>
              <span className="font-bold text-xl tracking-tight">NexusMsg</span>
              <p className="text-[10px] uppercase font-mono text-muted-foreground tracking-widest">
                Bulk WhatsApp sender
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-full text-xs font-bold text-muted-foreground uppercase tracking-wider">
            <span className="size-1.5 bg-primary rounded-full animate-pulse" />
            v2.4.0
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 mt-10">
        <h1 className="sr-only">NexusMsg WhatsApp Bulk Sender</h1>
        <Stepper current={step} />

        {step === 1 && (
          <StepRecipients
            mode={mode}
            jsonFile={jsonFile}
            manualText={manualText}
            onSetJson={setJsonFile}
            onSetManual={setManualText}
            onSetMode={setMode}
            onNext={goToMessages}
          />
        )}

        {step === 2 && (
          <StepMessages
            messages={messages}
            onChange={setMessages}
            onBack={() => setStep(1)}
            onNext={goToConnect}
          />
        )}

        {step === 3 && sessionId && (
          <StepConnect
            sessionId={sessionId}
            connected={connected}
            onConnectionChange={setConnected}
            connectionState={connectionState}
            onConnectionStateChange={setConnectionState}
            scanEtaSeconds={scanEtaSeconds}
            onScanEtaChange={setScanEtaSeconds}
            onBack={() => setStep(2)}
            onStart={goToSending}
          />
        )}

        {step === 4 && sessionId && (
          <StepSending
            sessionId={sessionId}
            messages={messages}
            total={recipients.length}
            onComplete={(r) => {
              setResult(r);
              setStep(5);
            }}
          />
        )}

        {step === 5 && result && sessionId && (
          <StepResults sessionId={sessionId} result={result} onRestart={restart} />
        )}
      </main>
    </div>
  );
}