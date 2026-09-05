import { AlertTriangle, ChevronRight, Loader2, RotateCcw } from "lucide-react";
import { ValidationSummary } from "../types";
import { StatCard } from "./StatCard";
import { Button } from "@/components/ui/button";
import { hasBlockingRows } from "../hooks/useRosterSync";

export default function ValidateStep({
  fileName,
  summary,
  isLoadingPreview,
  additiveOnly,
  onAdditiveOnlyChange,
  onProceed,
  onReset,
}: {
  fileName:             string;
  summary:              ValidationSummary;
  isLoadingPreview:     boolean;
  additiveOnly:         boolean;
  onAdditiveOnlyChange: (v: boolean) => void;
  onProceed:            () => void;
  onReset:              () => void;
}) {
  const hasValid = summary.valid > 0;
  // Rows can be skipped — the students they name are sent along as exemptions,
  // so the sync leaves them untouched instead of reading their absence as a
  // departure. Only rows that name nobody can't be handled that way.
  const isBlocked   = hasBlockingRows(summary);
  const skippedRows = summary.invalid + summary.duplicates;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-slate-800 mb-1">Validation Summary</h2>
        <p className="text-sm text-slate-500">
          Parsed from <strong className="text-slate-700">{fileName}</strong>. Review the results
          before proceeding.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Rows"        value={summary.total}      accent="slate" />
        <StatCard label="Valid Rows"        value={summary.valid}      accent="green" />
        <StatCard label="Duplicates"        value={summary.duplicates} accent="amber" />
        <StatCard label="Skipped Rows"      value={summary.invalid}    accent="amber" />
      </div>

      {/* Row breakdown — show up to 50 invalid/duplicate rows */}
      {skippedRows > 0 && (
        <div
          className={`rounded-lg border p-3 ${
            isBlocked ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"
          }`}
        >
          <p
            className={`text-xs font-semibold mb-1 flex items-center gap-1 ${
              isBlocked ? "text-red-700" : "text-amber-700"
            }`}
          >
            <AlertTriangle className="size-3.5" />
            {isBlocked
              ? "Rows that name no student — synchronization blocked"
              : `Rows to be skipped: ${skippedRows}`}
          </p>
          <p className={`text-[11px] mb-2 ${isBlocked ? "text-red-600" : "text-amber-700"}`}>
            {isBlocked ? (
              <>
                {summary.unidentifiable} row(s) have a missing or malformed Student ID, so there is
                no way to tell which student they describe. Those students cannot be protected, and
                would be deactivated with their Fees, Fines, and Clearance Status for the active
                term <strong>permanently deleted</strong>. Fix the Student ID in these rows and
                upload the file again.
              </>
            ) : (
              <>
                These rows will not be imported. The students they name are left exactly as they
                are and are <strong>protected from deactivation</strong> — their existing records
                are not touched.
              </>
            )}
          </p>
          <div className="max-h-36 overflow-y-auto space-y-1">
            {summary.rows
              .filter((r) => !r.valid)
              .slice(0, 50)
              .map((r) => (
                <div key={r.rowNumber} className="flex items-center justify-between text-xs gap-2">
                  <span className={`font-mono ${isBlocked ? "text-red-800" : "text-amber-800"}`}>
                    Row {r.rowNumber}: {r.raw.studentId || "(empty)"}
                  </span>
                  <span
                    className={`text-[10px] text-right ${
                      isBlocked ? "text-red-600" : "text-amber-600"
                    }`}
                  >
                    {r.reason}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {!hasValid && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
          <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
          No valid roster rows were found in this file. Please upload a different file.
        </div>
      )}

      {/* Synchronization mode — the safe mode is the default, and the
          destructive half is opted into deliberately. */}
      <fieldset className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
        <legend className="px-1 text-xs font-semibold text-slate-600">Synchronization mode</legend>

        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="radio"
            name="sync-mode"
            className="mt-1 accent-emerald-600"
            checked={additiveOnly}
            onChange={() => onAdditiveOnlyChange(true)}
          />
          <span className="text-xs">
            <span className="font-semibold text-slate-800">
              Additive only — add, update and transfer
            </span>
            <span className="block text-slate-500">
              No student is deactivated and no record is archived. Safe to run against an
              incomplete roster. <strong>Recommended.</strong>
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="radio"
            name="sync-mode"
            className="mt-1 accent-red-600"
            checked={!additiveOnly}
            onChange={() => onAdditiveOnlyChange(false)}
          />
          <span className="text-xs">
            <span className="font-semibold text-slate-800">
              Full sync — also retire students missing from the roster
            </span>
            <span className="block text-slate-500">
              Students absent from the file are marked as no longer enrolled, and their Fees,
              Fines and Clearance <em>for the active term only</em> are archived. Previous
              semesters are never touched, and archiving is reversible.
            </span>
          </span>
        </label>
      </fieldset>

      <div className="flex items-center justify-between pt-1">
        <Button
          variant="outline"
          size="sm"
          onClick={onReset}
          className="border-slate-200 text-slate-600 gap-1"
        >
          <RotateCcw className="size-3.5" /> Upload different file
        </Button>
        <Button
          onClick={onProceed}
          disabled={!hasValid || isBlocked || isLoadingPreview}
          className="gap-2"
        >
          {isLoadingPreview ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Fetching preview…
            </>
          ) : (
            <>
              Proceed to Preview <ChevronRight className="size-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
