import type { ResolvedRosterRow } from "../types";

/** The current-state snapshot of one existing student, as read from Firestore. */
export interface ExistingStudent {
  docId:     string;
  studentId: string;
  firstName: string;
  lastName:  string;
  yearLevel: string;
  program:   string;
  faculty:   string;
  programId: string;
  facultyId: string;
  isDeleted: boolean;
}

export interface CreateOp {
  row: ResolvedRosterRow;
}

export interface UpdateOp {
  docId:       string;
  studentId:   string;
  firstName:   string;
  lastName:    string;
  yearLevel:   string;
  program:     string;
  faculty:     string;
  programId:   string;
  facultyId:   string;
  reactivated: boolean;
  /** The student's programId or facultyId changed — they are moving between
   *  organizations, since membership is a live query on those fields. */
  transferred: boolean;
  /** Previous program display name, for preview output only. */
  fromProgram: string;
}

export interface DeactivateOp {
  docId:     string;
  studentId: string;
  /** Display-only, computed from the existing record's firstName/lastName. */
  fullName:  string;
}

export interface RosterDiffPlan {
  toCreate:     CreateOp[];
  toUpdate:     UpdateOp[];
  toDeactivate: DeactivateOp[];
  unchanged:    string[];
  /** Students left out of the roster payload but deliberately protected from
   *  deactivation — their row was skipped, they did not leave. */
  exempted:     string[];
}

function toDisplayName(firstName: string, lastName: string): string {
  return `${firstName ?? ""} ${lastName ?? ""}`.trim();
}

/**
 * Computes the minimal set of writes needed to bring the student roster in
 * sync with `rosterRows`, given the current state in `existingByStudentId`.
 *
 * Pure and side-effect-free by design: it never touches Firestore, so the
 * synchronization rules (create / update / deactivate / leave alone) can be
 * exhaustively unit tested without a database.
 *
 * Callers MUST pass an already-deduplicated `rosterRows` (one entry per
 * studentId) — this function does not dedupe, since deciding *how* to
 * collapse duplicates (first-wins vs. reject) is a caller-level policy
 * concern, not a diffing concern.
 *
 * `exemptStudentIds` are students whose roster row was skipped (unreadable, or
 * naming an unknown program/faculty). Absence from the payload normally means
 * "left the university" and triggers deactivation plus deletion of the term's
 * fees/fines/clearance — so a skipped student MUST be passed here, or skipping
 * a row silently destroys their records.
 */
export function diffRoster(
  rosterRows: ResolvedRosterRow[],
  existingByStudentId: Map<string, ExistingStudent>,
  exemptStudentIds: ReadonlySet<string> = new Set()
): RosterDiffPlan {
  const toCreate: CreateOp[] = [];
  const toUpdate: UpdateOp[] = [];
  const unchanged: string[] = [];
  const seenStudentIds = new Set<string>();

  for (const row of rosterRows) {
    seenStudentIds.add(row.studentId);
    const existing = existingByStudentId.get(row.studentId);

    if (!existing) {
      toCreate.push({ row });
      continue;
    }

    // A transfer is tracked on the IDs, never the display names: the names are
    // cosmetic, but programId/facultyId are what organization membership is
    // queried on, so only a change there actually moves the student.
    const transferred =
      existing.programId !== row.programId || existing.facultyId !== row.facultyId;

    const fieldsChanged =
      existing.firstName !== row.firstName ||
      existing.lastName !== row.lastName ||
      existing.yearLevel !== row.yearLevel ||
      existing.program !== row.program ||
      existing.faculty !== row.faculty;
    const reactivated = existing.isDeleted === true;

    if (fieldsChanged || reactivated || transferred) {
      toUpdate.push({
        docId: existing.docId,
        studentId: row.studentId,
        firstName: row.firstName,
        lastName: row.lastName,
        yearLevel: row.yearLevel,
        program: row.program,
        faculty: row.faculty,
        programId: row.programId,
        facultyId: row.facultyId,
        reactivated,
        transferred,
        fromProgram: existing.program,
      });
    } else {
      unchanged.push(row.studentId);
    }
  }

  const toDeactivate: DeactivateOp[] = [];
  const exempted: string[] = [];
  for (const [studentId, existing] of existingByStudentId) {
    if (seenStudentIds.has(studentId) || existing.isDeleted) continue;

    // Missing because their row was skipped, not because they left.
    if (exemptStudentIds.has(studentId)) {
      exempted.push(studentId);
      continue;
    }

    toDeactivate.push({
      docId: existing.docId,
      studentId,
      fullName: toDisplayName(existing.firstName, existing.lastName),
    });
  }

  return { toCreate, toUpdate, toDeactivate, unchanged, exempted };
}
