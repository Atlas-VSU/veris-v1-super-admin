import { ConfirmationDialog } from "@/components/features/shared/ConfirmationDialog";
import { RosterSyncPreview } from "../types";
import { ArrowRightLeft, ShieldAlert, UserMinus, Users } from "lucide-react";
import React from "react";

export default function ConfirmModal({
  open,
  preview,
  onOpenChange,
  onConfirm,
}: {
  open:         boolean;
  preview:      RosterSyncPreview | null;
  onOpenChange: (v: boolean) => void;
  onConfirm:    () => void;
}) {
  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={onOpenChange}
      variant="danger"
      title={
        <React.Fragment>
          <ShieldAlert className="size-5" /> Confirm Roster Synchronization
        </React.Fragment>
      }
      confirmText="Confirm Synchronization"
      onConfirm={onConfirm}
      warningMessage={
        preview?.additiveOnly ? (
          <React.Fragment>
            <strong>Additive only.</strong> This will create new students, update changed records,
            and move students between organizations where their program or faculty changed.{" "}
            <strong>No student will be deactivated and no records will be archived</strong> —
            students missing from this roster are left exactly as they are.
          </React.Fragment>
        ) : (
          <React.Fragment>
            <strong>Warning:</strong> This will create, update, transfer, and deactivate student
            records to match the uploaded roster. Students whose program or faculty changed will
            move between organizations. Students missing from the roster will be marked{" "}
            <code>isDeleted = true</code> and lose system access, and their Fees, Fines, and
            Clearance Status for the active Academic Year and Semester will be{" "}
            <strong>archived</strong> — hidden from the organization apps but not deleted, and
            reversible by clearing the archive flag. Records from previous semesters are never
            touched.
          </React.Fragment>
        )
      }
    >
      {preview && (
        <div className="grid grid-cols-2 gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
          <div>
            <span className="text-slate-400">New Students</span>
            <p className="font-semibold text-slate-700 flex items-center gap-1">
              <Users className="size-3 text-emerald-500" /> {preview.toCreate}
            </p>
          </div>
          <div>
            <span className="text-slate-400">Students to Update</span>
            <p className="font-semibold text-slate-700 flex items-center gap-1">
              <Users className="size-3 text-blue-500" /> {preview.toUpdate}
            </p>
          </div>
          <div>
            <span className="text-slate-400">Changing Organizations</span>
            <p className="font-semibold text-slate-700 flex items-center gap-1">
              <ArrowRightLeft className="size-3 text-amber-500" /> {preview.toTransfer}
            </p>
          </div>
          <div>
            <span className="text-slate-400">Students to Deactivate</span>
            <p className="font-semibold text-slate-700 flex items-center gap-1">
              <UserMinus className="size-3 text-red-500" /> {preview.toDeactivate}
            </p>
          </div>
          <div>
            <span className="text-slate-400">Records to be Archived</span>
            <p className="font-semibold text-slate-700">
              {preview.additiveOnly
                ? 0
                : preview.matchingFees + preview.matchingFines + preview.matchingClearance}
            </p>
          </div>
          <div>
            <span className="text-slate-400">Unchanged</span>
            <p className="font-semibold text-slate-700">{preview.unchanged}</p>
          </div>
        </div>
      )}
    </ConfirmationDialog>
  );
}
