import { Download, RotateCcw, PartyPopper } from "lucide-react";
import type { CampaignResult } from "./types";
import { exportUrl } from "@/lib/whatsappApi";

interface Props {
  sessionId: string;
  result: CampaignResult;
  onRestart: () => void;
}

function downloadFrom(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}

export function StepResults({ sessionId, result, onRestart }: Props) {
  const successRate = result.total
    ? Math.round((result.sent.length / result.total) * 100)
    : 0;

  return (
    <div className="space-y-8">
      <div className="bg-card rounded-2xl border border-border p-8 shadow-sm">
        <div className="flex items-start justify-between flex-wrap gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <PartyPopper className="size-5 text-primary" />
              <span className="text-xs font-bold uppercase tracking-widest text-primary">
                Campaign completed
              </span>
            </div>
            <h2 className="text-3xl font-bold">{successRate}% delivery rate</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Processed {result.total} numbers · finished at{" "}
              {new Date().toLocaleTimeString()}
            </p>
          </div>
          <button
            onClick={onRestart}
            className="px-5 py-3 bg-foreground text-background font-bold rounded-xl hover:opacity-90 flex items-center gap-2"
          >
            <RotateCcw className="size-4" /> New Campaign
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <SummaryStat label="Sent successfully" value={result.sent.length} accent="border-success" />
          <SummaryStat label="Not on WhatsApp" value={result.notWa.length} accent="border-warning" />
          <SummaryStat label="Errors" value={result.failed.length} accent="border-destructive" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ResultList
          title="Successful"
          color="text-success"
          dot="bg-success"
          items={result.sent.map((n) => ({ primary: n }))}
          onDownload={() => downloadFrom(exportUrl(sessionId, "success"), "success.txt")}
          downloadLabel="Download Success List"
        />
        <ResultList
          title="Not on WhatsApp"
          color="text-warning"
          dot="bg-warning"
          items={result.notWa.map((n) => ({ primary: n }))}
          onDownload={() => downloadFrom(exportUrl(sessionId, "not-whatsapp"), "not_whatsapp.txt")}
          downloadLabel="Download Not-WhatsApp List"
        />
        <ResultList
          title="Failed"
          color="text-destructive"
          dot="bg-destructive"
          items={result.failed.map((f) => ({ primary: f.number, secondary: f.reason }))}
          onDownload={() => downloadFrom(exportUrl(sessionId, "failed"), "failed.txt")}
          downloadLabel="Download Failed List"
        />
      </div>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className={`border-l-4 ${accent} pl-4 py-2`}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-3xl font-bold font-mono">{value}</p>
    </div>
  );
}

function ResultList({
  title,
  color,
  dot,
  items,
  onDownload,
  downloadLabel,
}: {
  title: string;
  color: string;
  dot: string;
  items: { primary: string; secondary?: string }[];
  onDownload: () => void;
  downloadLabel: string;
}) {
  return (
    <div className="bg-card rounded-2xl border border-border p-6 shadow-sm flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className={`size-2 rounded-full ${dot}`} />
          <h3 className={`text-sm font-bold ${color} uppercase tracking-wider`}>{title}</h3>
        </div>
        <span className="text-xs font-mono text-muted-foreground">{items.length}</span>
      </div>
      <div className="h-56 overflow-y-auto font-mono text-xs space-y-1.5 pr-1 mb-4">
        {items.length === 0 ? (
          <p className="text-muted-foreground italic">None</p>
        ) : (
          items.map((it, i) => (
            <div key={i} className="flex justify-between gap-3 border-b border-border/60 pb-1.5">
              <span>{it.primary}</span>
              {it.secondary && (
                <span className="text-muted-foreground text-[10px] truncate max-w-[120px]">
                  {it.secondary}
                </span>
              )}
            </div>
          ))
        )}
      </div>
      <button
        onClick={onDownload}
        disabled={items.length === 0}
        className="mt-auto w-full py-2.5 border border-border rounded-lg text-xs font-bold hover:bg-muted transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Download className="size-3.5" />
        {downloadLabel}
      </button>
    </div>
  );
}
