import type { ResolvedRosterRow, RosterRow } from "../types";

/** One program, as needed for resolution. `facultyId` is the authoritative
 *  faculty for that program — it is the system's own data, not the CSV's. */
export interface ProgramRef {
  id:        string;
  facultyId: string;
}

export interface FacultyRef {
  id: string;
}

/**
 * Lookup tables keyed by BOTH name and acronym, already normalised via
 * `referenceKey` — rosters are exported by hand and use either form
 * ("BS Computer Science" or "BSCS", "College of Arts and Sciences" or "CAS").
 */
export interface RosterReferenceData {
  programs:  Map<string, ProgramRef>;
  faculties: Map<string, FacultyRef>;
}

/** A row that names a program or faculty the system does not know. */
export interface UnresolvedRosterRow {
  studentId: string;
  reason:    string;
}

export interface ReferenceResolution {
  rows:         ResolvedRosterRow[];
  unresolvable: UnresolvedRosterRow[];
}

/**
 * Normalises a program/faculty name or acronym into a lookup key:
 * case-insensitive, with runs of whitespace collapsed. Applied to both sides
 * of every lookup so "bs computer  science" matches "BS Computer Science".
 */
export function referenceKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Resolves each row's human-readable `program`/`faculty` names into the
 * `programId`/`facultyId` the rest of the system actually keys off.
 *
 * Organization membership is a live query on `programId`/`facultyId`
 * (see `buildBaseConstraints` in the org app), never a stored orgId — so a
 * roster that writes only display names records a program shift without ever
 * moving the student between organizations. Resolution is what makes a
 * transfer real.
 *
 * FACULTY IS DERIVED FROM THE PROGRAM, not taken from the CSV: a program
 * already carries its own `facultyId`, and trusting a hand-edited faculty
 * column over the system's own data risks filing a student under a faculty
 * that contradicts their program. The CSV's faculty column is still checked
 * for agreement, and a genuine conflict rejects the row rather than silently
 * picking a winner.
 *
 * An unresolvable row is returned rather than thrown away: its studentId is
 * known, so the caller can leave that student untouched AND exempt them from
 * deactivation. Silently dropping it would instead read as "this student left
 * the university" and delete their term records.
 *
 * Pure and Firestore-free: the caller supplies the reference data, so the
 * resolution rules stay unit-testable without a database.
 */
export function resolveRosterReferences(
  rows: RosterRow[],
  reference: RosterReferenceData
): ReferenceResolution {
  const resolved: ResolvedRosterRow[] = [];
  const unresolvable: UnresolvedRosterRow[] = [];

  for (const row of rows) {
    const program = reference.programs.get(referenceKey(row.program));
    if (!program) {
      unresolvable.push({ studentId: row.studentId, reason: `unknown program "${row.program}"` });
      continue;
    }

    const csvFaculty = reference.faculties.get(referenceKey(row.faculty));
    if (!csvFaculty) {
      unresolvable.push({ studentId: row.studentId, reason: `unknown faculty "${row.faculty}"` });
      continue;
    }

    // The program's own faculty wins; the CSV column must agree with it.
    const facultyId = program.facultyId || csvFaculty.id;
    if (program.facultyId && program.facultyId !== csvFaculty.id) {
      unresolvable.push({
        studentId: row.studentId,
        reason: `program "${row.program}" does not belong to faculty "${row.faculty}"`,
      });
      continue;
    }

    resolved.push({ ...row, programId: program.id, facultyId });
  }

  return { rows: resolved, unresolvable };
}
