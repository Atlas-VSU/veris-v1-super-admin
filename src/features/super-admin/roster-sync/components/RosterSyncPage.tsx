"use client";
import { FileText } from "lucide-react";
import { PageHeader } from "@/features/super-admin/shared/components/PageHeader";

import { useEffect } from "react";
import { useRosterSync } from "../hooks/useRosterSync";
import { useSyncHistory } from "../hooks/useSyncHistory";
import SyncHistory from "./SyncHistory";
import { StepBar } from "./StepBar";
import { StepKey } from "../types";
import UploadStep from "./UploadStep";
import ValidateStep from "./ValidateStep";
import PreviewStep from "./PreviewStep";
import ExecuteStep from "./ExecuteStep";
import CompleteStep from "./CompleteStep";
import ConfirmModal from "./ConfirmModal";


export default function RosterSyncPage() {
  const {
    step,
    fileName,
    validation,
    preview,
    result,
    confirmOpen,
    isLoadingPreview,
    additiveOnly,
    acknowledgeMass,
    useRecoveredIds,
    applyRecoveredIds,
    setAdditiveOnly,
    setAcknowledgeMass,
    setConfirmOpen,
    handleFileSelected,
    handleProceedToPreview,
    handleConfirm,
    handleExecute,
    handleReset,
    handleCopyResult,
    handleDownloadResult,
    handleExportNewStudents,
  } = useRosterSync();

  const {
    entries: historyEntries,
    isLoading: isHistoryLoading,
    error: historyError,
    refresh: refreshHistory,
  } = useSyncHistory();

  // A completed run is a new history entry — pull it in so the list the user
  // returns to already reflects what they just did.
  useEffect(() => {
    if (step === "complete") refreshHistory();
  }, [step, refreshHistory]);

  // Map internal step key to the progress bar key
  const barStep = step === "confirm" ? "preview" : step;

  return (
    <div className="animate-page-enter flex flex-col">
      <PageHeader
        title="SYNCHRONIZE STUDENT ROSTER"
        description="Update the student roster from a newly uploaded file — create new students, update changed records, and deactivate students no longer enrolled."
      />

      <div className="mx-auto max-w-7xl w-full px-5 sm:px-6 xl:px-8 py-8 space-y-6">
        {/* ── Step Progress Bar ────────────────────────────────────────────── */}
        <StepBar current={barStep as StepKey} />

        {/* ── Step Content Card ────────────────────────────────────────────── */}
        <div className="rounded-xl border border-blue-100 bg-white shadow-sm">
          <div className="px-6 py-6">
            {step === "upload" && (
              <UploadStep onFile={handleFileSelected} />
            )}

            {step === "validate" && validation && (
              <ValidateStep
                fileName={fileName}
                summary={validation}
                isLoadingPreview={isLoadingPreview}
                additiveOnly={additiveOnly}
                onAdditiveOnlyChange={setAdditiveOnly}
                useRecoveredIds={useRecoveredIds}
                onUseRecoveredIdsChange={applyRecoveredIds}
                onProceed={handleProceedToPreview}
                onReset={handleReset}
              />
            )}

            {(step === "preview" || step === "confirm") && preview && (
              <PreviewStep
                preview={preview}
                acknowledgeMass={acknowledgeMass}
                onAcknowledgeMassChange={setAcknowledgeMass}
                onConfirm={handleConfirm}
                onBack={handleReset}
                onExportNewStudents={handleExportNewStudents}
              />
            )}

            {step === "execute" && <ExecuteStep />}

            {step === "complete" && result && (
              <CompleteStep
                result={result}
                onCopy={handleCopyResult}
                onDownload={handleDownloadResult}
                onReset={handleReset}
                onExportNewStudents={handleExportNewStudents}
                canExportNewStudents={(preview?.createStudentIds.length ?? 0) > 0}
              />
            )}
          </div>
        </div>

        {/* ── Previous synchronizations ───────────────────────────────────── */}
        {/* Shown while choosing a file, when "when did we last sync, and what
            did it do?" is the question actually being asked. Hidden mid-run so
            it does not compete with the step the user is working through. */}
        {(step === "upload" || step === "complete") && (
          <SyncHistory
            entries={historyEntries}
            isLoading={isHistoryLoading}
            error={historyError}
            onRefresh={refreshHistory}
          />
        )}

        {/* ── Info footer ─────────────────────────────────────────────────── */}
        {(step === "upload" || step === "validate") && (
          <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
            <FileText className="size-3.5 shrink-0 mt-0.5" />
            <p>
              Only <code>firstName</code>, <code>lastName</code>, <code>yearLevel</code>,{" "}
              <code>program</code>, and <code>faculty</code> are updated for existing students —
              every other field (email, authentication, org membership, etc.) is left untouched.
              The Student ID itself is never modified.
            </p>
          </div>
        )}

        {/* ── Confirmation Modal ───────────────────────────────────────────── */}
        <ConfirmModal
          open={confirmOpen}
          preview={preview}
          onOpenChange={setConfirmOpen}
          onConfirm={handleExecute}
        />
      </div>
    </div>
  );
}
