/**
 * Pure planning for what a newly created student is owed by each organization
 * they belong to: a clearance record, and the organization's existing fees for
 * the active term.
 *
 * Firestore-free by design — the caller supplies the organizations, their fee
 * templates, and whatever fees the student already holds — so the rules that
 * decide who gets charged what are unit-testable without a database.
 */

/** An organization, as needed to decide membership and clearance. */
export interface OrgRef {
  id:          string;
  programId:   string | null;
  facultyId:   string | null;
  accessLevel: number;
}

/** One of an organization's fee templates for the active term. */
export interface FeeItemRef {
  id:                    string;
  orgId:                 string;
  title:                 string;
  feeType:               string;
  amount:                number;
  description:           string;
  eventId:               string | null;
  dueDate:               unknown;
  isRequiredForClearance: boolean;
  academicYear:          string;
  semester:              string;
}

/**
 * An event an organization has already generated fines for.
 *
 * `amount` is resolved by the caller from the event's fine type — doubled when
 * the type requires a time-out, matching how the org app prices a full absence.
 */
export interface FineEventRef {
  eventId:      string;
  orgId:        string;
  eventName:    string;
  eventDate:    unknown;
  fineTypeId:   string;
  fineTypeName: string;
  amount:       number;
  academicYear: string;
  semester:     string;
}

export interface ProvisionSubject {
  userId:    string;
  studentId: string;
  userName:  string;
  programId: string;
  facultyId: string;
}

export interface PlannedFee {
  feeItem: FeeItemRef;
  orgId:   string;
}

export interface PlannedFine {
  event: FineEventRef;
  orgId: string;
}

export interface PlannedProvision {
  subject:     ProvisionSubject;
  orgId:       string;
  accessLevel: number;
  clearanceId: string;
  /** True when a clearance record already exists — its live status and blocking
   *  items must never be overwritten, so only the fees are added. */
  clearanceExists: boolean;
  fees:        PlannedFee[];
  /** Fines for events this organization has already run generation on, which
   *  the student missed by not being in the system at the time. */
  fines:       PlannedFine[];
}

/**
 * Whether a student belongs to an organization.
 *
 * Scope is decided by the organization's ACCESS LEVEL, never by which id
 * fields happen to be populated: level 1 is a program, level 2 a faculty,
 * level 3 the whole university.
 *
 * An earlier version keyed on field presence instead and ended with a bare
 * `return true`, so a faculty-level organization whose `facultyId` was missing
 * or empty fell through to the university-wide branch and matched EVERY
 * student — provisioning a clearance record for the entire student body under
 * that one organization. Those records then appeared on its clearance page,
 * which reads on `orgId` alone and treats the record's existence as the
 * membership claim. Fees did not follow, because fee generation in the org app
 * scopes correctly, which is why the symptom was clearance without fees.
 *
 * A scoped organization missing its id now matches NOBODY rather than
 * everybody: provisioning too few records is visible and repairable, while
 * provisioning too many silently grants standing across the university.
 * Mirrors the org app's `onboardNewStudent`, which is deliberately strict for
 * the same reason. Callers pass subscribed organizations only.
 */
export function studentBelongsToOrg(
  org: OrgRef,
  programId: string,
  facultyId: string
): boolean {
  if (org.accessLevel === 1) return !!org.programId && org.programId === programId;
  if (org.accessLevel === 2) return !!org.facultyId && org.facultyId === facultyId;
  if (org.accessLevel === 3) return true;
  return false;
}

/**
 * Deterministic clearance document ID — byte-identical to the org app's
 * `buildClearanceId`, so both applications address the same record.
 */
export function buildClearanceId(
  userId: string,
  orgId: string,
  term: { AY: string; semester: string }
): string {
  return `${userId}${orgId}${`:${term.AY}-${term.semester}`.replace(/\s/g, "_")}`;
}

/**
 * Plans clearance and fee assignment for each subject.
 *
 * A fee is only ever planned when the student does not already hold one for
 * that same fee template. `existingFeeItemIds` is keyed by userId and holds the
 * `feeItemId` of every fee already on that student, so re-running a roster —
 * or recovering from a partially failed one — never charges anybody twice.
 * `existingFineEventIds` does the same for fines, keyed by userId and holding
 * every eventId the student has already been fined for.
 *
 * Clearance records that already exist are reported rather than rewritten: the
 * record carries live status and blocking items which a re-run must not reset.
 * Fees and fines are still planned for such students, and the caller merges the
 * resulting blocking items into the existing record.
 */
export function planProvisions(
  subjects: ProvisionSubject[],
  orgs: OrgRef[],
  feeItemsByOrg: Map<string, FeeItemRef[]>,
  existingFeeItemIds: Map<string, Set<string>>,
  existingClearanceIds: Set<string>,
  term: { AY: string; semester: string },
  fineEventsByOrg: Map<string, FineEventRef[]> = new Map(),
  existingFineEventIds: Map<string, Set<string>> = new Map()
): PlannedProvision[] {
  const planned: PlannedProvision[] = [];

  for (const subject of subjects) {
    const alreadyHeld = existingFeeItemIds.get(subject.userId) ?? new Set<string>();
    const alreadyFined = existingFineEventIds.get(subject.userId) ?? new Set<string>();

    for (const org of orgs) {
      if (!studentBelongsToOrg(org, subject.programId, subject.facultyId)) continue;

      const clearanceId = buildClearanceId(subject.userId, org.id, term);
      const fees = (feeItemsByOrg.get(org.id) ?? [])
        .filter((feeItem) => !alreadyHeld.has(feeItem.id))
        .map((feeItem) => ({ feeItem, orgId: org.id }));

      const fines = (fineEventsByOrg.get(org.id) ?? [])
        .filter((event) => !alreadyFined.has(event.eventId))
        .map((event) => ({ event, orgId: org.id }));

      // Nothing to do for this pairing — the student already holds every fee
      // and fine, and their clearance record is in place.
      if (fees.length === 0 && fines.length === 0 && existingClearanceIds.has(clearanceId)) continue;

      planned.push({
        subject,
        orgId: org.id,
        accessLevel: org.accessLevel,
        clearanceId,
        clearanceExists: existingClearanceIds.has(clearanceId),
        fees,
        fines,
      });
    }
  }

  return planned;
}

/**
 * The status a freshly created clearance record should carry.
 *
 * Mirrors `recalculateClearanceStatus`: cleared unless the student holds an
 * unpaid item that is required for clearance. Computed up front so a new record
 * is correct on creation rather than needing a second recalculating pass — a
 * record written as "cleared" while carrying unpaid required fees would read as
 * a student who owes nothing.
 *
 * An unpaid fine always blocks: the org app files every fine item as a blocking
 * item without asking whether it is required, so a fine is required by
 * construction.
 */
export function clearanceStatusFor(
  fees: PlannedFee[],
  fines: PlannedFine[] = []
): "cleared" | "not_cleared" {
  if (fines.length > 0) return "not_cleared";
  return fees.some((f) => f.feeItem.isRequiredForClearance) ? "not_cleared" : "cleared";
}
