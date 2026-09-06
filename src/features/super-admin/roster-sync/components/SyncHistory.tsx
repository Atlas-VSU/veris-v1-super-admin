"use client";

import { AlertTriangle, History, Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RosterSyncLogEntry } from "../types";
import { toDate } from "../hooks/useSyncHistory";

function formatWhen(value: unknown): string {
  const date = toDate(value);
  if (!date) return "Unknown date";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Compact "3 created · 12 updated" line — zero-valued figures are dropped so
 *  the meaningful numbers are not buried among a row of noughts. */
function changeSummary(entry: RosterSyncLogEntry): string {
  const parts: string[] = [];
  if (entry.toCreate) parts.push(`${entry.toCreate} created`);
  if (entry.toUpdate) parts.push(`${entry.toUpdate} updated`);
  if (entry.toTransfer) parts.push(`${entry.toTransfer} transferred`);
  if (entry.toDeactivate) parts.push(`${entry.toDeactivate} retired`);
  if (entry.exempted) parts.push(`${entry.exempted} skipped`);
  return parts.length > 0 ? parts.join(" · ") : "No changes applied";
}

function archivedTotal(entry: RosterSyncLogEntry): number {
  return (entry.feesArchived ?? 0) + (entry.finesArchived ?? 0) + (entry.clearanceArchived ?? 0);
}

export default function SyncHistory({
  entries,
  isLoading,
  error,
  onRefresh,
}: {
  entries:   RosterSyncLogEntry[];
  isLoading: boolean;
  error:     string | null;
  onRefresh: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
            <History className="size-4 text-slate-400" /> Previous Synchronizations
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Executed runs only — dry runs change nothing and are not recorded.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isLoading}
          className="border-slate-200 text-slate-600 gap-1"
        >
          <RotateCcw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="px-6 py-4">
        {isLoading && entries.length === 0 && (
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <Loader2 className="size-3.5 animate-spin" /> Loading history…
          </p>
        )}

        {error && !isLoading && (
          <p className="flex items-start gap-2 text-xs text-amber-700">
            <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
            {error}
          </p>
        )}

        {!isLoading && !error && entries.length === 0 && (
          <p className="text-xs text-slate-500">
            No synchronization has been run yet. The first executed run will appear here.
          </p>
        )}

        {entries.length > 0 && (
          <ol className="divide-y divide-slate-100">
            {entries.map((entry) => {
              const archived = archivedTotal(entry);
              return (
                <li key={entry.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-800">
                      {formatWhen(entry.completedAt)}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {entry.activeTerm && (
                        <> {entry.activeTerm.AY} {entry.activeTerm.semester} sem</>
                      )}
                    </span>
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {entry.additiveOnly ? (
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                        <ShieldCheck className="size-3" /> Additive only
                      </span>
                    ) : (
                      <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                        Full sync
                      </span>
                    )}

                    {entry.partial && (
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                        Partial — {entry.batchesCompleted}/{entry.batchesTotal} batches
                      </span>
                    )}

                    {entry.acknowledgedMassDeactivation && (
                      <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                        Mass deactivation acknowledged
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-[11px] text-slate-600">
                    {entry.rosterRowsSubmitted} row(s) submitted — {changeSummary(entry)}
                    {archived > 0 && (
                      <>
                        {" · "}
                        <span className="text-amber-700">
                          {archived} record(s) archived
                        </span>
                      </>
                    )}
                  </p>

                  {entry.errorMessage && (
                    <p className="mt-1 text-[11px] text-red-600">{entry.errorMessage}</p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
