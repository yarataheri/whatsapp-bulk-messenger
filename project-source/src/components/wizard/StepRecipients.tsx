import { useRef, useState } from "react";
import { Upload, FileJson, ListOrdered, ArrowRight, X } from "lucide-react";
import { toast } from "sonner";
import type { RecipientMode } from "./types";

interface Props {
  mode: RecipientMode | null;
  jsonFile: { name: string; numbers: string[] } | null;
  manualText: string;
  onSetJson: (f: { name: string; numbers: string[] } | null) => void;
  onSetManual: (t: string) => void;
  onSetMode: (m: RecipientMode | null) => void;
  onNext: () => void;
}

function parseManual(t: string): string[] {
  return t
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

export function StepRecipients({
  mode,
  jsonFile,
  manualText,
  onSetJson,
  onSetManual,
  onSetMode,
  onNext,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const arr: string[] = Array.isArray(parsed)
        ? parsed.map(String)
        : Array.isArray(parsed?.numbers)
        ? parsed.numbers.map(String)
        : [];
      if (!arr.length) {
        toast.error("No numbers found in JSON. Expected array or { numbers: [...] }.");
        return;
      }
      onSetJson({ name: file.name, numbers: arr });
      onSetMode("json");
    } catch {
      toast.error("Invalid JSON file.");
    }
  };

  const manualCount = parseManual(manualText).length;
  const canContinue =
    (mode === "json" && jsonFile && jsonFile.numbers.length > 0) ||
    (mode === "manual" && manualCount > 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-6">
        <div className="bg-card rounded-2xl border border-border p-8 shadow-sm">
          <h2 className="text-2xl font-bold mb-1">Choose Recipients</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Pick one method — upload a JSON file or paste numbers manually.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* JSON upload */}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) handleFile(f);
              }}
              className={[
                "text-left rounded-xl border-2 border-dashed p-6 transition-all",
                mode === "json"
                  ? "border-primary bg-accent"
                  : dragOver
                  ? "border-primary bg-accent/50"
                  : "border-border hover:border-primary/50 hover:bg-muted/40",
                mode === "manual" ? "opacity-40" : "",
              ].join(" ")}
            >
              <div className="flex items-center gap-2 mb-3">
                <FileJson className="size-5 text-primary" />
                <span className="font-bold text-sm">Option A — Upload JSON</span>
              </div>
              {jsonFile ? (
                <div className="bg-card rounded-lg border border-border p-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">{jsonFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {jsonFile.numbers.length} numbers
                    </p>
                  </div>
                  <div
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSetJson(null);
                      onSetMode(null);
                    }}
                    className="size-7 grid place-items-center rounded-md hover:bg-muted text-muted-foreground"
                  >
                    <X className="size-4" />
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center">
                  <Upload className="size-7 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Drop file or <span className="text-primary font-bold">browse</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                    array or {`{ numbers: [...] }`}
                  </p>
                </div>
              )}
              <input
                ref={inputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </button>

            {/* Manual entry */}
            <div
              className={[
                "rounded-xl border-2 p-4 transition-all",
                mode === "manual"
                  ? "border-primary bg-accent"
                  : "border-border bg-card",
                mode === "json" ? "opacity-40" : "",
              ].join(" ")}
            >
              <div className="flex items-center gap-2 mb-3">
                <ListOrdered className="size-5 text-primary" />
                <span className="font-bold text-sm">Option B — Paste Manually</span>
              </div>
              <textarea
                value={manualText}
                disabled={mode === "json"}
                onFocus={() => mode !== "manual" && onSetMode("manual")}
                onChange={(e) => {
                  onSetManual(e.target.value);
                  if (e.target.value && mode !== "manual") onSetMode("manual");
                }}
                rows={6}
                placeholder={"+49123456789\n+49123456788\n+49123456787"}
                className="w-full font-mono text-sm bg-background border border-border rounded-lg p-3 outline-none focus:ring-2 focus:ring-primary resize-none placeholder:text-muted-foreground/50"
              />
              <div className="flex justify-between items-center mt-2">
                <p className="text-[11px] text-muted-foreground">One number per line.</p>
                <p className="text-[11px] font-mono text-muted-foreground">
                  {manualCount} numbers
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <aside className="space-y-6">
        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
          <h3 className="text-sm font-bold text-muted-foreground uppercase mb-3 tracking-wider">
            Tips
          </h3>
          <ul className="space-y-3 text-sm text-foreground/80">
            <li className="flex gap-2">
              <span className="text-primary font-bold">·</span>
              Numbers must be in international format (with country code).
            </li>
            <li className="flex gap-2">
              <span className="text-primary font-bold">·</span>
              JSON can be a plain array or an object with a <code className="font-mono text-xs bg-muted px-1 rounded">numbers</code> key.
            </li>
            <li className="flex gap-2">
              <span className="text-primary font-bold">·</span>
              You can only use one input method per campaign.
            </li>
          </ul>
        </div>

        <div className="flex justify-end">
          <button
            onClick={onNext}
            disabled={!canContinue}
            className="px-6 py-3 bg-primary text-primary-foreground font-bold rounded-xl shadow-sm hover:bg-primary-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            Next <ArrowRight className="size-4" />
          </button>
        </div>
      </aside>
    </div>
  );
}
