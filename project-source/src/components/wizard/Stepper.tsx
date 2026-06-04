import { Check } from "lucide-react";

const STEPS = [
  { id: 1, label: "Recipients" },
  { id: 2, label: "Content" },
  { id: 3, label: "Connect" },
  { id: 4, label: "Sending" },
  { id: 5, label: "Results" },
];

export function Stepper({ current }: { current: number }) {
  return (
    <div className="flex justify-between mb-12 relative">
      <div className="absolute top-4 left-0 w-full h-0.5 bg-border z-0" />
      <div
        className="absolute top-4 left-0 h-0.5 bg-primary z-0 transition-all duration-500"
        style={{ width: `${((current - 1) / (STEPS.length - 1)) * 100}%` }}
      />
      {STEPS.map((s) => {
        const done = s.id < current;
        const active = s.id === current;
        return (
          <div key={s.id} className="relative z-10 flex flex-col items-center gap-2">
            <div
              className={[
                "size-8 rounded-full flex items-center justify-center font-bold text-sm ring-4 ring-background transition-colors",
                done
                  ? "bg-primary text-primary-foreground"
                  : active
                  ? "bg-accent-info text-white"
                  : "bg-card border-2 border-border text-muted-foreground",
              ].join(" ")}
            >
              {done ? <Check className="size-4" strokeWidth={3} /> : s.id}
            </div>
            <span
              className={[
                "text-xs font-medium",
                active ? "text-foreground font-bold" : done ? "text-foreground" : "text-muted-foreground",
              ].join(" ")}
            >
              {s.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
