"use client";

/**
 * useRosterSync
 *
 * State machine for the "Synchronize Student Roster" page.
 *
 * Steps:
 *   1  UPLOAD      — user selects a CSV or XLSX roster file
 *   2  VALIDATE    — file is parsed, rows are validated and summarised
 *   3  PREVIEW     — dry-run API call; displays what would change
 *   4  CONFIRM     — confirmation modal; user reads the warning
 *   5  EXECUTE      — execute API call
 *   6  COMPLETE     — final result display + copy/download actions
 */

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { SyncStep, ValidationSummary, ParsedRosterRow, ParsedFileRow, RosterSyncPreview, RosterSyncResult } from "../types";
import { parseRosterFile } from "../utils/parseRosterFile";
import { buildRosterCsv, selectRowsByStudentId } from "../utils/buildRosterCsv";
import { validateRosterRow } from "../utils/validateRosterRow";
import { normaliseStudentId } from "../utils/normaliseStudentId";
import { STUDENT_ID_RE } from "../const";

/**
 * True when the file contains rows that cannot be skipped safely.
 *
 * A skipped row is left out of the payload, and absence normally means "left
 * the university" — deactivation plus deletion of the term's records. That is
 * survivable as long as the student can still be named, because the sync is
 * told to exempt them (`excludedStudentIds`).
 *
 * A row whose studentId is itself missing or malformed names nobody, so no
 * exemption can be made for it, and whichever student it was meant to describe
 * would be deactivated. Only those rows block the sync.
 */
export function hasBlockingRows(summary: ValidationSummary): boolean {
  return summary.unidentifiable > 0;
}

/** Flattens an API error payload (`error` + optional `details[]`) into one message. */
function formatApiError(err: { error?: string; details?: string[] }, status: number): string {
  const base = err.error || `HTTP ${status}`;
  if (!err.details?.length) return base;
  const shown = err.details.slice(0, 5).join("; ");
  const more  = err.details.length > 5 ? ` (+${err.details.length - 5} more)` : "";
  return `${base} — ${shown}${more}`;
}

/**
 * Turns parsed file rows into the validation summary the Validate step shows.
 *
 * `useRecovered` decides how a Student ID that Excel stored as a date is
 * treated. Rejected (the default) the row is skipped, since the value in the
 * file is a date and no student is named by it. Accepted, the rebuilt candidate
 * stands in for the original and the row validates like any other — the
 * operator has taken responsibility for it being the right student.
 *
 * Pure, so the same file can be revalidated under either choice without being
 * re-read from disk.
 */
function buildValidationSummary(
  parsed: ParsedFileRow[],
  useRecovered: boolean
): ValidationSummary {
  const seen = new Set<string>();

  const rows: ParsedRosterRow[] = parsed.map(({ excelRow, raw, dateCoerced, recovered }) => {
    const recoveredId = recovered?.studentId;
    // Only the Student ID can be rebuilt; a name Excel ate is gone for good, so
    // a row with any other date-typed column stays unusable either way.
    const otherDateColumns = dateCoerced.filter((c) => c !== "studentId");
    const idRecovered = useRecovered && !!recoveredId && dateCoerced.includes("studentId");

    if (otherDateColumns.length > 0 || (dateCoerced.includes("studentId") && !idRecovered)) {
      const columns = (idRecovered ? otherDateColumns : dateCoerced).join(", ");
      const shown = (idRecovered ? otherDateColumns : dateCoerced)
        .map((c) => raw[c])
        .join(", ");
      const suggestion =
        recoveredId && !useRecovered
          ? ` The Student ID looks like "${recoveredId}" — accept recovered IDs below to use it, or format the column as Text and re-export.`
          : " Format that column as Text and re-export — the original value is not recoverable from this file.";

      return {
        rowNumber: excelRow,
        raw,
        valid: false,
        reason: `Excel stored ${columns} as a date (${shown}).${suggestion}`,
      };
    }

    const candidateRaw = idRecovered ? { ...raw, studentId: recoveredId } : raw;

    const result = validateRosterRow(candidateRaw);
    if (!result.valid) {
      return { rowNumber: excelRow, raw: candidateRaw, valid: false, reason: result.reason };
    }
    if (seen.has(result.row.studentId)) {
      return {
        rowNumber: excelRow,
        raw: candidateRaw,
        valid: false,
        reason: `Duplicate studentId: ${result.row.studentId}`,
      };
    }
    seen.add(result.row.studentId);
    return { rowNumber: excelRow, raw: candidateRaw, valid: true, row: result.row };
  });

  const validRows  = rows.filter((r) => r.valid).map((r) => r.row!);
  const duplicates = rows.filter((r) => r.reason?.startsWith("Duplicate studentId")).length;
  const invalid    = rows.filter((r) => !r.valid).length - duplicates;

  // A skipped row can be made harmless only if we can still say which student
  // it was about — that studentId is sent as an exemption so the sync leaves
  // them alone instead of deactivating them.
  const excludedStudentIds = new Set<string>();
  let unidentifiable = 0;
  for (const row of rows) {
    if (row.valid) continue;
    const studentId = normaliseStudentId((row.raw.studentId ?? "").toString().trim());
    if (STUDENT_ID_RE.test(studentId)) {
      excludedStudentIds.add(studentId);
    } else {
      unidentifiable++;
    }
  }

  return {
    total: rows.length,
    valid: validRows.length,
    duplicates,
    invalid,
    validRows,
    rows,
    excludedStudentIds: [...excludedStudentIds],
    unidentifiable,
    // Offered regardless of the current choice, so the Validate step can show
    // the option even while it is switched off.
    recoverableIds: parsed.filter((p) => p.recovered?.studentId).length,
  };
}

export function useRosterSync() {
  const [step, setStep]                         = useState<SyncStep>("upload");
  const [fileName, setFileName]                 = useState<string>("");
  const [validation, setValidation]             = useState<ValidationSummary | null>(null);
  const [preview, setPreview]                   = useState<RosterSyncPreview | null>(null);
  const [result, setResult]                     = useState<RosterSyncResult | null>(null);
  const [confirmOpen, setConfirmOpen]           = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isExecuting, setIsExecuting]           = useState(false);
  // Default ON: the safe mode is the one that cannot retire a student, and the
  // operator opts into the destructive half deliberately.
  const [additiveOnly, setAdditiveOnly]         = useState(true);
  const [acknowledgeMass, setAcknowledgeMass]   = useState(false);
  // The parsed file is retained so validation can be recomputed when the
  // operator accepts recovered Student IDs, without asking for the file again.
  const [parsedRows, setParsedRows]             = useState<ParsedFileRow[]>([]);
  // Off by default: a Student ID rebuilt from a date is a candidate, not a
  // fact, and using the wrong one attaches the row to a different student.
  const [useRecoveredIds, setUseRecoveredIds]   = useState(false);

  // ── Step 1 → 2: Parse & validate uploaded file ───────────────────────────
  const handleFileSelected = useCallback(async (file: File) => {
    setFileName(file.name);
    setUseRecoveredIds(false);

    let rawRows: Awaited<ReturnType<typeof parseRosterFile>> = [];
    try {
      rawRows = await parseRosterFile(file);
    } catch (err: any) {
      toast.error("Failed to parse file", { description: err?.message });
      return;
    }
    setParsedRows(rawRows);

    setValidation(buildValidationSummary(rawRows, false));
    setStep("validate");
  }, []);

  /**
   * Accepts or rejects the Student IDs rebuilt from date-typed cells, and
   * revalidates the file already in hand. Toggling re-runs the whole summary
   * because accepting an ID can also surface a duplicate it collides with.
   */
  const applyRecoveredIds = useCallback(
    (accepted: boolean) => {
      setUseRecoveredIds(accepted);
      setValidation(buildValidationSummary(parsedRows, accepted));
    },
    [parsedRows]
  );

  // ── Step 2 → 3: Dry-run preview ──────────────────────────────────────────
  const handleProceedToPreview = useCallback(async () => {
    if (!validation || validation.validRows.length === 0) return;
    // A row the client drops is indistinguishable, server-side, from a student
    // who left the university. Identifiable rows travel as exemptions; rows
    // naming nobody cannot, so the file must be corrected and re-uploaded.
    if (hasBlockingRows(validation)) return;

    setIsLoadingPreview(true);
    try {
      const res = await fetch("/api/roster-sync", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          students: validation.validRows,
          dryRun: true,
          excludedStudentIds: validation.excludedStudentIds,
          additiveOnly,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(formatApiError(err, res.status));
      }

      const data = await res.json();
      setPreview(data);
      setStep("preview");
    } catch (err: any) {
      toast.error("Dry-run preview failed", { description: err?.message });
    } finally {
      setIsLoadingPreview(false);
    }
    // additiveOnly must be a dependency: without it the preview would be
    // computed from a stale mode and could show "nothing will be retired" for a
    // run that then retires students.
  }, [validation, additiveOnly]);

  // ── Step 3 → 4: Open confirmation modal ──────────────────────────────────
  const handleConfirm = useCallback(() => {
    setConfirmOpen(true);
  }, []);

  // ── Step 4 → 5 → 6: Execute ──────────────────────────────────────────────
  const handleExecute = useCallback(async () => {
    if (!validation) return;
    // Re-asserted here, not just at the preview gate: execution must never be
    // reachable with a partially-submitted roster (see hasBlockingRows).
    if (hasBlockingRows(validation)) return;

    setConfirmOpen(false);
    setStep("execute");
    setIsExecuting(true);

    try {
      const res = await fetch("/api/roster-sync", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          students: validation.validRows,
          dryRun: false,
          excludedStudentIds: validation.excludedStudentIds,
          additiveOnly,
          acknowledgeMassDeactivation: acknowledgeMass,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(formatApiError(err, res.status));
      }

      const data: RosterSyncResult = await res.json();
      setResult(data);
      setStep("complete");
      if (data.partial) {
        toast.warning("Synchronization completed partially", {
          description: "Some batches failed to commit — re-running the same file is safe and will finish the rest.",
        });
      } else {
        toast.success("Roster synchronized successfully!");
      }
    } catch (err: any) {
      toast.error("Synchronization failed", { description: err?.message });
      // Stay on execute step so the user can see the error state
    } finally {
      setIsExecuting(false);
    }
  }, [validation, additiveOnly, acknowledgeMass]);

  // ── Reset (start over) ────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    setStep("upload");
    setFileName("");
    setValidation(null);
    setPreview(null);
    setResult(null);
    setConfirmOpen(false);
    setIsLoadingPreview(false);
    setIsExecuting(false);
    setAdditiveOnly(true);
    setAcknowledgeMass(false);
    setParsedRows([]);
    setUseRecoveredIds(false);
  }, []);

  // ── Download/copy result ──────────────────────────────────────────────────
  const buildResultText = useCallback((log: RosterSyncResult): string => {
    const lines = [
      "VERIS — Roster Synchronization — Result",
      "════════════════════════════════════════",
      "",
      `Completed At:          ${new Date(log.completedAt).toLocaleString()}`,
      `Roster Rows Submitted: ${log.rosterRowsSubmitted}`,
      "",
      `Students Created:      ${log.toCreate}`,
      `Students Updated:      ${log.toUpdate}`,
      `Changing Organizations:${log.toTransfer}`,
      `Students Deactivated:  ${log.toDeactivate}`,
      `Skipped (protected):   ${log.exempted}`,
      `Unchanged:             ${log.unchanged}`,
      "",
      `Fees Archived:         ${log.feesArchived}`,
      `Fines Archived:        ${log.finesArchived}`,
      `Clearance Archived:    ${log.clearanceArchived}`,
      "",
      `Clearance Created:     ${log.clearanceCreated}`,
      `Fees Assigned:         ${log.feesAssigned}`,
      `Fines Assigned:        ${log.finesAssigned}`,
      `Students Reactivated:  ${log.reactivated}`,
      `Records Restored:      ${log.recordsRestored}`,
      "",
      log.partial
        ? `Partially completed (${log.batchesCompleted}/${log.batchesTotal} batches). Re-run the same file to finish.`
        : "Synchronization completed successfully.",
    ];
    return lines.join("\n");
  }, []);

  const handleCopyResult = useCallback(async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(buildResultText(result));
      toast.success("Result copied to clipboard!");
    } catch {
      toast.error("Failed to copy result to clipboard.");
    }
  }, [result, buildResultText]);

  const handleDownloadResult = useCallback(() => {
    if (!result) return;
    const text = buildResultText(result);
    const blob = new Blob([text], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `roster-sync-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result, buildResultText]);

  /**
   * Downloads the students this roster would create, in the import format.
   *
   * Built from the rows the operator uploaded rather than from the preview
   * payload: the preview truncates its list for display, and rebuilding the
   * file from the original rows means the exported columns match the imported
   * ones by construction instead of by a mapping kept in step by hand.
   */
  const handleExportNewStudents = useCallback(() => {
    if (!validation || !preview || preview.createStudentIds.length === 0) return;

    const newRows = selectRowsByStudentId(validation.validRows, preview.createStudentIds);
    if (newRows.length === 0) {
      toast.info("No new students to export.");
      return;
    }

    // BOM so Excel opens the file as UTF-8 and does not mangle accented names.
    const blob = new Blob(["﻿" + buildRosterCsv(newRows)], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `new-students-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${newRows.length} new student(s).`);
  }, [validation, preview]);

  return {
    // State
    step,
    fileName,
    validation,
    preview,
    result,
    confirmOpen,
    isLoadingPreview,
    isExecuting,
    additiveOnly,
    acknowledgeMass,

    // Actions
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
  };
}
