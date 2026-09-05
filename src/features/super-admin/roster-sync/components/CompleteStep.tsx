import { CheckCircle2, AlertTriangle, RotateCcw, Download, Copy } from "lucide-react";
import { RosterSyncResult } from "../types";
import { Button } from "@/components/ui/button";
import { StatCard } from "./StatCard";

export default function CompleteStep({
  result,
  onCopy,
  onDownload,
  onReset,
}: {
  result:     RosterSyncResult;
  onCopy:     () => void;
  onDownload: () => void;
  onReset:    () => void;
}) {
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className={`flex size-10 items-center justify-center rounded-full ${
            result.partial ? "bg-amber-100" : "bg-emerald-100"
          }`}
        >
          {result.partial ? (
            <AlertTriangle className="size-5 text-amber-600" />
          ) : (
            <CheckCircle2 className="size-5 text-emerald-600" />
          )}
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-800">
            {result.partial ? "Synchronization Partially Completed" : "Synchronization Completed"}
          </h2>
          <p className="text-xs text-slate-500">
            {new Date(result.completedAt).toLocaleString()}
          </p>
        </div>
      </div>

      {result.partial && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
          <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
          <p>
            Only {result.batchesCompleted} of {result.batchesTotal} batches committed before an
            error occurred. Re-uploading the same file is safe — already-applied changes will be
            left as-is and only the remaining changes will be attempted.
          </p>
        </div>
      )}

      {/* Active term */}
      {result.activeTerm && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-500 mb-1">
            Academic Term
          </p>
          <p className="text-sm font-bold text-blue-800">
            {result.activeTerm.AY} &mdash;{" "}
            {result.activeTerm.semester === "1st" ? "First" : "Second"} Semester
          </p>
        </div>
      )}

      {/* Result grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Roster Rows"   value={result.rosterRowsSubmitted} accent="slate" />
        <StatCard label="Created"       value={result.toCreate}            accent="green" />
        <StatCard label="Updated"       value={result.toUpdate}            accent="blue"  />
        <StatCard label="Deactivated"   value={result.toDeactivate}        accent="red"   />
        <StatCard label="Unchanged"     value={result.unchanged}           accent="slate" />
      </div>

      {result.toDeactivate > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Fees Archived"      value={result.feesArchived}      accent="amber" />
          <StatCard label="Fines Archived"     value={result.finesArchived}     accent="amber" />
          <StatCard label="Clearance Archived" value={result.clearanceArchived} accent="amber" />
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onCopy}
            className="border-slate-200 text-slate-600 gap-1.5"
          >
            <Copy className="size-3.5" /> Copy Result
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onDownload}
            className="border-slate-200 text-slate-600 gap-1.5"
          >
            <Download className="size-3.5" /> Download Result
          </Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onReset}
          className="border-slate-200 text-slate-600 gap-1.5"
        >
          <RotateCcw className="size-3.5" /> Start New Sync
        </Button>
      </div>
    </div>
  );
}
