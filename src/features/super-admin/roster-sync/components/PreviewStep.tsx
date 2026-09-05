import { AlertTriangle, ArrowRightLeft, ShieldAlert, ShieldCheck } from "lucide-react";
import { RosterSyncPreview } from "../types";
import { StatCard } from "./StatCard";
import { Button } from "@/components/ui/button";

export default function PreviewStep({
  preview,
  acknowledgeMass,
  onAcknowledgeMassChange,
  onConfirm,
  onBack,
}: {
  preview:                 RosterSyncPreview;
  acknowledgeMass:         boolean;
  onAcknowledgeMassChange: (v: boolean) => void;
  onConfirm:               () => void;
  onBack:                  () => void;
}) {
  // The server refuses a run over the threshold unless it is acknowledged, so
  // the button must not promise something the request will reject.
  const blockedByThreshold = preview.massDeactivation && !acknowledgeMass;
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-slate-800 mb-1">Dry Run Preview</h2>
        <p className="text-sm text-slate-500">
          No changes have been made yet. Review the summary below before confirming.
        </p>
      </div>

      {preview.additiveOnly && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-xs font-semibold text-emerald-800 flex items-center gap-1 mb-1">
            <ShieldCheck className="size-3.5" /> Additive only — nothing will be retired
          </p>
          <p className="text-[11px] text-emerald-700">
            Students missing from this roster are left completely untouched. No student is
            deactivated and no Fees, Fines, or Clearance records are archived. Switch to full sync
            on the previous step if you need to retire students who have left.
          </p>
        </div>
      )}

      {preview.massDeactivation && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3">
          <p className="text-xs font-semibold text-red-800 flex items-center gap-1 mb-1">
            <ShieldAlert className="size-3.5" /> Unusually large number of deactivations
          </p>
          <p className="text-[11px] text-red-700 mb-2">
            This roster would retire <strong>{preview.toDeactivate}</strong> of{" "}
            <strong>{preview.activeStudentCount}</strong> active students. That usually means the
            uploaded file is incomplete — a single college&apos;s export, or a file that lost rows
            in conversion — rather than a genuine graduation event.{" "}
            <strong>Re-check the file before proceeding.</strong>
          </p>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 accent-red-600"
              checked={acknowledgeMass}
              onChange={(e) => onAcknowledgeMassChange(e.target.checked)}
            />
            <span className="text-[11px] font-medium text-red-800">
              I have verified this roster is complete and intend to retire these students.
            </span>
          </label>
        </div>
      )}

      {/* Active term banner */}
      {preview.activeTerm && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-500 mb-1">
            Active Academic Term
          </p>
          <p className="text-sm font-bold text-blue-800">
            {preview.activeTerm.AY} &mdash;{" "}
            {preview.activeTerm.semester === "1st" ? "First" : "Second"} Semester
          </p>
        </div>
      )}

      {/* Summary grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Roster Rows"      value={preview.rosterRowsSubmitted} accent="slate" />
        <StatCard label="New Students"     value={preview.toCreate}            accent="green" />
        <StatCard label="To Update"        value={preview.toUpdate}            accent="blue"  />
        <StatCard label="Transferring"     value={preview.toTransfer}          accent="amber" />
        <StatCard label="To Deactivate"    value={preview.toDeactivate}        accent="red"   />
        <StatCard label="Skipped"          value={preview.exempted}            accent="amber" />
        <StatCard label="Unchanged"        value={preview.unchanged}           accent="slate" />
      </div>

      {preview.exempted > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs font-semibold text-amber-700 flex items-center gap-1 mb-1">
            <ShieldCheck className="size-3.5" /> Skipped and protected: {preview.exempted}
          </p>
          <p className="text-[11px] text-amber-700">
            These students are in the system but their roster row was skipped. They are{" "}
            <strong>not</strong> being deactivated and none of their Fees, Fines, or Clearance
            Status records are being deleted — they are simply left as they are.
          </p>
          {preview.unresolvedRows.length > 0 && (
            <>
              <p className="text-[11px] text-amber-700 mt-2 mb-1">
                Skipped here because the program or faculty could not be matched:
              </p>
              <div className="font-mono text-[11px] text-amber-800 max-h-28 overflow-y-auto space-y-0.5">
                {preview.unresolvedRows.map((r) => (
                  <div key={r.studentId}>{r.studentId} — {r.reason}</div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {preview.toTransfer > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs font-semibold text-amber-700 flex items-center gap-1 mb-1">
            <ArrowRightLeft className="size-3.5" /> Students changing organizations:{" "}
            {preview.toTransfer}
          </p>
          <p className="text-[11px] text-amber-700 mb-2">
            Their program or faculty changed, which moves them between organizations.{" "}
            {preview.clearanceToCreate > 0 ? (
              <>
                <strong>{preview.clearanceToCreate}</strong> Clearance Status record(s) will be
                created so they appear in their new organization for the active term. Existing
                dues stay with the organization that issued them.
              </>
            ) : (
              <>Existing dues stay with the organization that issued them.</>
            )}
          </p>
          {preview.transferPreview.length > 0 && (
            <div className="font-mono text-[11px] text-amber-800 max-h-28 overflow-y-auto space-y-0.5">
              {preview.transferPreview.map((s) => (
                <div key={s.studentId}>
                  {s.studentId} — {s.fullName}: {s.fromProgram || "(none)"} → {s.toProgram}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {preview.toDeactivate > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-xs font-semibold text-red-700 flex items-center gap-1 mb-1">
            <AlertTriangle className="size-3.5" /> Students to be deactivated: {preview.toDeactivate}
          </p>
          <p className="text-[11px] text-red-600 mb-2">
            These students are missing from the uploaded roster and will be marked{" "}
            <code>isDeleted = true</code>, revoking their system access. Their Fees, Fines and
            Clearance <strong>for the active term only</strong> are archived — hidden, not
            deleted, and reversible. Records from previous semesters are never touched.
          </p>
          {preview.deactivatePreview.length > 0 && (
            <div className="font-mono text-[11px] text-red-700 max-h-28 overflow-y-auto space-y-0.5 mb-2">
              {preview.deactivatePreview.map((s) => (
                <div key={s.studentId}>{s.studentId} — {s.fullName}</div>
              ))}
            </div>
          )}
          {preview.activeTerm ? (
            <div className="grid grid-cols-3 gap-2">
              <StatCard label="Matching Fees"      value={preview.matchingFees}      accent="amber" />
              <StatCard label="Matching Fines"     value={preview.matchingFines}     accent="amber" />
              <StatCard label="Matching Clearance" value={preview.matchingClearance} accent="amber" />
            </div>
          ) : (
            <p className="text-[11px] text-red-600">
              No active term is configured — Fees, Fines, and Clearance Status records will not be
              cleaned up for these students.
            </p>
          )}
        </div>
      )}

      {preview.toCreate > 0 && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1 mb-1">
            New students to be created: {preview.toCreate}
          </p>
          {preview.createPreview.length > 0 && (
            <div className="font-mono text-[11px] text-emerald-700 max-h-28 overflow-y-auto space-y-0.5">
              {preview.createPreview.map((s) => (
                <div key={s.studentId}>{s.studentId} — {s.fullName}</div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <Button
          variant="outline"
          size="sm"
          onClick={onBack}
          className="border-slate-200 text-slate-600"
        >
          Back
        </Button>
        <Button
          onClick={onConfirm}
          disabled={blockedByThreshold}
          variant={preview.additiveOnly ? "default" : "destructive"}
          className="gap-2"
        >
          <ShieldAlert className="size-4" /> Confirm Synchronization
        </Button>
      </div>
    </div>
  );
}
