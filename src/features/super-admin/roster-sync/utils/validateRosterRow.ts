import { STUDENT_ID_RE, MAX_FIELD_LENGTH } from "../const";
import { normaliseStudentId } from "./normaliseStudentId";
import type { RawRosterRow, RosterRow } from "../types";

export type RosterRowValidation =
  | { valid: true; row: RosterRow }
  | { valid: false; reason: string };

function validateField(raw: unknown, label: string): { value: string } | { reason: string } {
  const value = (raw ?? "").toString().trim();
  if (!value) return { reason: `Missing ${label}` };
  if (value.length > MAX_FIELD_LENGTH) return { reason: `${label} exceeds ${MAX_FIELD_LENGTH} characters` };
  return { value };
}

/**
 * Validates and normalizes a single raw roster row.
 *
 * Runs on BOTH the client (for the upload/validate UX) and the server (as a
 * mandatory re-check before any write) — this is the single source of truth
 * for what makes a roster row acceptable.
 */
export function validateRosterRow(raw: RawRosterRow): RosterRowValidation {
  const studentIdRaw = (raw.studentId ?? "").toString().trim();
  if (!studentIdRaw) return { valid: false, reason: "Missing studentId" };

  const studentId = normaliseStudentId(studentIdRaw);
  if (!STUDENT_ID_RE.test(studentId)) {
    return { valid: false, reason: `Invalid studentId format: "${studentIdRaw}"` };
  }

  const firstName = validateField(raw.firstName, "firstName");
  if ("reason" in firstName) return { valid: false, reason: firstName.reason };

  const lastName  = validateField(raw.lastName, "lastName");
  if ("reason" in lastName) return { valid: false, reason: lastName.reason };

  const yearLevel = validateField(raw.yearLevel, "yearLevel");
  if ("reason" in yearLevel) return { valid: false, reason: yearLevel.reason };

  const program   = validateField(raw.program, "program");
  if ("reason" in program) return { valid: false, reason: program.reason };

  const faculty   = validateField(raw.faculty, "faculty");
  if ("reason" in faculty) return { valid: false, reason: faculty.reason };

  return {
    valid: true,
    row: {
      studentId,
      firstName: firstName.value,
      lastName:  lastName.value,
      yearLevel: yearLevel.value,
      program:   program.value,
      faculty:   faculty.value,
    },
  };
}
