import { CheckCircle2 } from "lucide-react";
import { STEPS } from "../const";
import { StepKey } from "../types";

const STEP_ORDER: StepKey[] = ["upload", "validate", "preview", "execute", "complete"];

function getStepIndex(key: StepKey): number {
  return STEP_ORDER.indexOf(key);
}

// ── Step Progress Bar ─────────────────────────────────────────────────────────
export function StepBar({ current }: { current: StepKey }) {
  const currentIdx = getStepIndex(current);
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((step, idx) => {
        const done   = idx < currentIdx;
        const active = idx === currentIdx;
        const Icon   = step.icon;

        return (
          <div key={step.key} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div
                className={[
                  "flex size-8 items-center justify-center rounded-full border-2 transition-all",
                  done   ? "border-blue-600 bg-blue-600 text-white" : "",
                  active ? "border-blue-600 bg-white text-blue-600 shadow-sm" : "",
                  !done && !active ? "border-slate-200 bg-white text-slate-400" : "",
                ].join(" ")}
              >
                {done ? (
                  <CheckCircle2 className="size-4" />
                ) : (
                  <Icon className="size-4" />
                )}
              </div>
              <span
                className={[
                  "hidden sm:block text-[10px] font-medium whitespace-nowrap",
                  active ? "text-blue-600" : done ? "text-blue-500" : "text-slate-400",
                ].join(" ")}
              >
                {step.label}
              </span>
            </div>

            {idx < STEPS.length - 1 && (
              <div
                className={[
                  "flex-1 h-0.5 mx-1 sm:mx-2 transition-colors",
                  idx < currentIdx ? "bg-blue-500" : "bg-slate-200",
                ].join(" ")}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
