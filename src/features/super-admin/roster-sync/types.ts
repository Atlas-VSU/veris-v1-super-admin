// Type-only so this module stays importable from standalone maintenance
// scripts — `./const` pulls in lucide-react for the step icons.
import type { RosterColumn, STEPS } from "./const";

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
  /** Optional — registrar exports rarely carry addresses. When absent, one is
   *  derived from the Student ID for newly created students. */
  email?:     string;
}

/** A roster row that has passed validation and normalization. */
export interface RosterRow {
  studentId: string;
  firstName: string;
  lastName:  string;
  yearLevel: string;
  program:   string;
  faculty:   string;
  /** Empty when the roster carried no address — the caller derives one. Only
   *  ever written for newly created students; an update never touches the
   *  email of a student who may have verified their own. */
  email:     string;
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

/** One row as read from the file, before validation. */
export interface ParsedFileRow {
  /** Row number as the spreadsheet shows it — the header is row 1, so the
   *  first data row is 2. Reported values can be opened directly in Excel. */
  excelRow:    number;
  raw:         RawRosterRow;
  /** Columns Excel had stored as dates. The text originally typed is gone from
   *  the file, so these cannot be repaired here — only reported. */
  dateCoerced: RosterColumn[];
}

export interface ParsedRosterRow {
  /** Spreadsheet row number, matching what the operator sees in Excel. */
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

/**
 * One past synchronization, as stored in `rosterSyncLogs`.
 *
 * Only executed runs are recorded — a dry run changes nothing and is not part
 * of the history. Timestamps arrive from Firestore, so they may be an ISO
 * string or a `{ _seconds }` object depending on serialization.
 */
export interface RosterSyncLogEntry {
  id:                  string;
  completedAt:         unknown;
  actingUid:           string;
  actorName:           string;
  additiveOnly:        boolean;
  acknowledgedMassDeactivation?: boolean;
  activeTerm:          ActiveTerm | null;
  activeStudentCount:  number;
  rosterRowsSubmitted: number;
  toCreate:            number;
  toUpdate:            number;
  toTransfer:          number;
  toDeactivate:        number;
  unchanged:           number;
  exempted:            number;
  unresolvable:        number;
  feesArchived:        number;
  finesArchived:       number;
  clearanceArchived:   number;
  clearanceCreated:    number;
  feesAssigned:        number;
  partial:             boolean;
  batchesCompleted:    number;
  batchesTotal:        number;
  errorMessage:        string | null;
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
  /** Rows the server itself could not resolve (unknown program/faculty).
   *  These students are exempted from deactivation, not deleted. */
  unresolvedRows:     { studentId: string; reason: string }[];
  /** Rows that resolved despite an unrecognised faculty label — the program's
   *  own faculty was used. Worth surfacing so a missing acronym in the
   *  reference data gets noticed rather than silently papered over. */
  referenceWarnings:  { studentId: string; reason: string }[];
  /** True when the deactivation share exceeds the safety threshold — the
   *  signature of a partial roster. Execution is refused without explicit
   *  acknowledgement. */
  massDeactivation:   boolean;
  /** Active (non-deleted) students currently in the system, for context. */
  activeStudentCount: number;
  /** Clearance records that would be created for newly added students. */
  clearanceToCreate:  number;
  /** Organization fees that would be assigned to newly added students. Fees a
   *  student already holds are never counted, so a re-run reports zero. */
  feesToAssign:       number;
}

export interface RosterSyncResult extends RosterSyncSummary {
  dryRun:           false;
  /** Records hidden by setting their archive flag — never deleted, and always
   *  scoped to the active term, so previous semesters are untouched. */
  feesArchived:      number;
  finesArchived:     number;
  clearanceArchived: number;
  /** Provisioning applied to newly added students. */
  clearanceCreated:  number;
  feesAssigned:      number;
  completedAt:      string;
  partial:          boolean;
  batchesCompleted: number;
  batchesTotal:     number;
  error?:           string;
}
