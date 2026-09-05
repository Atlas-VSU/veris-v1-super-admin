// Type-only so this module stays importable from standalone maintenance
// scripts — `./const` pulls in lucide-react for the step icons.
import type { STEPS } from "./const";

export type StepKey = typeof STEPS[number]["key"];

export type SyncStep =
  | "upload"
  | "validate"
  | "preview"
  | "confirm"
  | "execute"
  | "complete";

/** A single roster row after header mapping, still unvalidated. */
export interface RawRosterRow {
  studentId?: string;
  firstName?: string;
  lastName?:  string;
  yearLevel?: string;
  program?:   string;
  faculty?:   string;
}

/** A roster row that has passed validation and normalization. */
export interface RosterRow {
  studentId: string;
  firstName: string;
  lastName:  string;
  yearLevel: string;
  program:   string;
  faculty:   string;
}

/**
 * A validated row whose program/faculty names have been resolved to the IDs
 * organization membership is actually queried on. Only this shape may be
 * written to Firestore — see `resolveRosterReferences`.
 */
export interface ResolvedRosterRow extends RosterRow {
  programId: string;
  facultyId: string;
}

export interface ParsedRosterRow {
  rowNumber: number;
  raw:       RawRosterRow;
  valid:     boolean;
  reason?:   string;
  row?:      RosterRow;
}

export interface ValidationSummary {
  total:      number;
  valid:      number;
  duplicates: number;
  invalid:    number;
  validRows:  RosterRow[];
  rows:       ParsedRosterRow[];
  /**
   * studentIds of skipped rows that could still be identified. These are sent
   * with the sync so the server exempts them from deactivation — a skipped
   * student has not left the university.
   */
  excludedStudentIds: string[];
  /**
   * Skipped rows whose studentId itself is missing or malformed. Nobody can
   * tell which student they refer to, so they cannot be exempted, and the sync
   * must not run until they are fixed.
   */
  unidentifiable: number;
}

// ── Server response shapes ─────────────────────────────────────────────────

export interface ActiveTerm {
  id:       string;
  AY:       string;
  semester: string;
}

export interface RosterSyncSummary {
  activeTerm:           ActiveTerm | null;
  rosterRowsSubmitted:  number;
  toCreate:             number;
  toUpdate:             number;
  /** Subset of `toUpdate` whose programId/facultyId changed — i.e. students
   *  moving between organizations. Counted separately because a transfer has
   *  consequences a name correction does not. */
  toTransfer:           number;
  toDeactivate:         number;
  unchanged:            number;
  /** Students whose row was skipped: left exactly as they are, and explicitly
   *  protected from deactivation. */
  exempted:             number;
  /** Run created, updated and transferred only — nobody was deactivated and
   *  nothing was archived. */
  additiveOnly:         boolean;
}

/** One student moving between organizations, for preview display. */
export interface TransferPreviewEntry {
  studentId:  string;
  fullName:   string;
  fromProgram: string;
  toProgram:   string;
}

export interface RosterSyncPreview extends RosterSyncSummary {
  dryRun: true;
  createPreview:      { studentId: string; fullName: string }[];
  updatePreview:      { studentId: string; fullName: string; reactivated: boolean }[];
  transferPreview:    TransferPreviewEntry[];
  deactivatePreview:  { studentId: string; fullName: string }[];
  matchingFees:       number;
  matchingFines:      number;
  matchingClearance:  number;
  /** Clearance Status records that would be created so transferred and newly
   *  created students appear in their organization for the active term. */
  clearanceToCreate:  number;
  /** Rows the server itself could not resolve (unknown program/faculty).
   *  These students are exempted from deactivation, not deleted. */
  unresolvedRows:     { studentId: string; reason: string }[];
  /** True when the deactivation share exceeds the safety threshold — the
   *  signature of a partial roster. Execution is refused without explicit
   *  acknowledgement. */
  massDeactivation:   boolean;
  /** Active (non-deleted) students currently in the system, for context. */
  activeStudentCount: number;
}

export interface RosterSyncResult extends RosterSyncSummary {
  dryRun:           false;
  /** Records hidden by setting their archive flag — never deleted, and always
   *  scoped to the active term, so previous semesters are untouched. */
  feesArchived:      number;
  finesArchived:     number;
  clearanceArchived: number;
  clearanceCreated: number;
  completedAt:      string;
  partial:          boolean;
  batchesCompleted: number;
  batchesTotal:     number;
  error?:           string;
}
