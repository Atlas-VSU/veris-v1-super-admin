import { MAX_ROSTER_ROWS } from "../const";
import { validateRosterRow } from "./validateRosterRow";
import type { RawRosterRow, RosterRow } from "../types";

const MAX_REPORTED_ROW_ERRORS = 50;

export type RosterRowsValidation =
  | { ok: true; rows: RosterRow[] }
  | { ok: false; error: string; details?: string[] };

/**
 * Validates an entire uploaded `students` array — the payload boundary for
 * `/api/roster-sync`. Pure and Firestore-free so it can be unit tested
 * directly, and shared verbatim between the client's pre-submit check and
 * the server's mandatory re-check (a client could bypass the UI entirely).
 *
 * Fails the WHOLE array (no partial processing) on:
 *   - a non-array, empty, or oversized payload
 *   - any row that fails per-row validation
 *   - any repeated studentId within the payload
 * A malformed or tampered request must never cause a partial, hard-to-audit
 * write — see the "Security" review notes in the route handler.
 */
export function validateRosterRows(students: unknown): RosterRowsValidation {
  if (!Array.isArray(students) || students.length === 0) {
    return { ok: false, error: "students must be a non-empty array." };
  }
  if (students.length > MAX_ROSTER_ROWS) {
    return { ok: false, error: `students exceeds the maximum of ${MAX_ROSTER_ROWS} rows per request.` };
  }

  const rows: RosterRow[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  (students as RawRosterRow[]).forEach((raw, index) => {
    const result = validateRosterRow(raw ?? {});
    if (!result.valid) {
      if (errors.length < MAX_REPORTED_ROW_ERRORS) errors.push(`Row ${index + 1}: ${result.reason}`);
      return;
    }
    if (seen.has(result.row.studentId)) {
      duplicates.add(result.row.studentId);
    } else {
      seen.add(result.row.studentId);
      rows.push(result.row);
    }
  });

  if (duplicates.size > 0) {
    return {
      ok: false,
      error: "students contains duplicate studentId values.",
      details: [...duplicates].slice(0, MAX_REPORTED_ROW_ERRORS),
    };
  }

  if (errors.length > 0) {
    return { ok: false, error: "One or more roster rows failed validation.", details: errors };
  }

  return { ok: true, rows };
}
