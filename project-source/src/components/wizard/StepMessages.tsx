import { useRef } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Image as ImageIcon,
  Video,
  Mic,
  Type,
  Plus,
  Trash2,
  Paperclip,
} from "lucide-react";
import type { CampaignMessage, MessageType } from "./types";

const TYPE_META: Record<MessageType, { icon: typeof Type; label: string; tint: string }> = {
  text: { icon: Type, label: "Text", tint: "bg-accent-info/10 text-accent-info" },
  image: { icon: ImageIcon, label: "Image", tint: "bg-warning-bg text-warning" },
  video: { icon: Video, label: "Video", tint: "bg-destructive-bg text-destructive" },
  audio: { icon: Mic, label: "Audio", tint: "bg-success-bg text-success" },
};

interface Props {
  messages: CampaignMessage[];
  onChange: (m: CampaignMessage[]) => void;
  onBack: () => void;
  onNext: () => void;
}

export function StepMessages({ messages, onChange, onBack, onNext }: Props) {
  const update = (id: string, patch: Partial<CampaignMessage>) =>
    onChange(messages.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const add = () =>
    onChange([
      ...messages,
      { id: crypto.randomUUID(), type: "text", text: "" },
    ]);

  const remove = (id: string) => onChange(messages.filter((m) => m.id !== id));

  const canContinue = messages.every((m) =>
    m.type === "text" ? !!m.text?.trim() : !!m.fileName,
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-6">
        <div className="bg-card rounded-2xl border border-border p-8 shadow-sm">
          <h2 className="text-2xl font-bold mb-1">Messages to Send</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Each recipient will receive these messages in order.
          </p>

          <div className="space-y-4">
            {messages.map((m, i) => (
              <MessageCard
                key={m.id}
                index={i}
                msg={m}
                onUpdate={(p) => update(m.id, p)}
                onRemove={messages.length > 1 ? () => remove(m.id) : undefined}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={add}
            className="mt-4 w-full py-4 border-2 border-dashed border-border hover:border-primary hover:bg-accent/40 transition-all rounded-xl text-sm font-bold text-muted-foreground hover:text-primary flex items-center justify-center gap-2"
          >
            <Plus className="size-4" /> Add Another Message
          </button>
        </div>
      </div>

      <aside className="space-y-6">
        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
          <h3 className="text-sm font-bold text-muted-foreground uppercase mb-3 tracking-wider">
            Sequence
          </h3>
          <ol className="space-y-2">
            {messages.map((m, i) => {
              const Icon = TYPE_META[m.type].icon;
              return (
                <li key={m.id} className="flex items-center gap-3 text-sm">
                  <span className="size-6 rounded-md bg-muted text-foreground font-bold text-xs grid place-items-center">
                    {i + 1}
                  </span>
                  <Icon className="size-4 text-muted-foreground" />
                  <span className="font-medium capitalize">{m.type}</span>
                  <span className="ml-auto text-xs text-muted-foreground truncate max-w-[120px]">
                    {m.type === "text" ? m.text?.slice(0, 24) || "—" : m.fileName || "—"}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="flex justify-between gap-3">
          <button
            onClick={onBack}
            className="px-5 py-3 bg-card border border-border font-bold rounded-xl hover:bg-muted transition-colors flex items-center gap-2"
          >
            <ArrowLeft className="size-4" /> Back
          </button>
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

function MessageCard({
  index,
  msg,
  onUpdate,
  onRemove,
}: {
  index: number;
  msg: CampaignMessage;
  onUpdate: (p: Partial<CampaignMessage>) => void;
  onRemove?: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const accept =
    msg.type === "image"
      ? "image/*"
      : msg.type === "video"
      ? "video/*"
      : msg.type === "audio"
      ? "audio/*"
      : "";

  return (
    <div className="border border-border rounded-xl p-5 bg-background/40">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="size-7 rounded-lg bg-foreground text-background font-bold text-xs grid place-items-center">
            {index + 1}
          </span>
          <span className="font-bold text-sm">Message {index + 1}</span>
        </div>
        {onRemove && (
          <button
            onClick={onRemove}
            className="size-8 grid place-items-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive-bg transition-colors"
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {(Object.keys(TYPE_META) as MessageType[]).map((t) => {
          const Icon = TYPE_META[t].icon;
          const active = msg.type === t;
          return (
            <button
              key={t}
              onClick={() => onUpdate({ type: t, text: t === "text" ? msg.text || "" : undefined, fileName: t === "text" ? undefined : msg.fileName })}
              className={[
                "px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2 border transition-all",
                active
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-foreground/30",
              ].join(" ")}
            >
              <Icon className="size-3.5" />
              {TYPE_META[t].label}
            </button>
          );
        })}
      </div>

      {msg.type === "text" ? (
        <textarea
          value={msg.text || ""}
          onChange={(e) => onUpdate({ text: e.target.value })}
          rows={3}
          placeholder="Hello, this is a test message."
          className="w-full text-sm bg-card border border-border rounded-lg p-3 outline-none focus:ring-2 focus:ring-primary resize-none"
        />
      ) : (
        <div>
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full p-4 rounded-lg border border-dashed border-border hover:border-primary hover:bg-accent/30 transition-all flex items-center gap-3"
          >
            <Paperclip className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              {msg.fileName || `Choose ${msg.type} file`}
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpdate({ fileName: f.name, file: f });
            }}
          />
        </div>
      )}
    </div>
  );
}
