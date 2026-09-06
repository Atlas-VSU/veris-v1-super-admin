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

export interface PlannedProvision {
  subject:     ProvisionSubject;
  orgId:       string;
  accessLevel: number;
  clearanceId: string;
  /** True when a clearance record already exists — its live status and blocking
   *  items must never be overwritten, so only the fees are added. */
  clearanceExists: boolean;
  fees:        PlannedFee[];
}

/**
 * Whether a student belongs to an organization.
 *
 * Mirrors the org app's self-registration approval rule: program-level orgs
 * match on programId, faculty-level orgs on facultyId, and an org scoped to
 * neither is university-wide. The org app's own version of this condition has
 * its `&&`/`||` unparenthesized, so an unsubscribed org can match on faculty;
 * that is not reproduced here — callers pass subscribed organizations only.
 */
export function studentBelongsToOrg(
  org: OrgRef,
  programId: string,
  facultyId: string
): boolean {
  if (org.programId) return org.programId === programId;
  if (org.facultyId) return org.facultyId === facultyId;
  return true;
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
 *
 * Clearance records that already exist are reported rather than rewritten: the
 * record carries live status and blocking items which a re-run must not reset.
 * Fees are still planned for such students, and the caller merges the resulting
 * blocking items into the existing record.
 */
export function planProvisions(
  subjects: ProvisionSubject[],
  orgs: OrgRef[],
  feeItemsByOrg: Map<string, FeeItemRef[]>,
  existingFeeItemIds: Map<string, Set<string>>,
  existingClearanceIds: Set<string>,
  term: { AY: string; semester: string }
): PlannedProvision[] {
  const planned: PlannedProvision[] = [];

  for (const subject of subjects) {
    const alreadyHeld = existingFeeItemIds.get(subject.userId) ?? new Set<string>();

    for (const org of orgs) {
      if (!studentBelongsToOrg(org, subject.programId, subject.facultyId)) continue;

      const clearanceId = buildClearanceId(subject.userId, org.id, term);
      const fees = (feeItemsByOrg.get(org.id) ?? [])
        .filter((feeItem) => !alreadyHeld.has(feeItem.id))
        .map((feeItem) => ({ feeItem, orgId: org.id }));

      // Nothing to do for this pairing — the student already holds every fee
      // and their clearance record is in place.
      if (fees.length === 0 && existingClearanceIds.has(clearanceId)) continue;

      planned.push({
        subject,
        orgId: org.id,
        accessLevel: org.accessLevel,
        clearanceId,
        clearanceExists: existingClearanceIds.has(clearanceId),
        fees,
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
 */
export function clearanceStatusFor(fees: PlannedFee[]): "cleared" | "not_cleared" {
  return fees.some((f) => f.feeItem.isRequiredForClearance) ? "not_cleared" : "cleared";
}
