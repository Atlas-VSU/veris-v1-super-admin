/**
 * /api/roster-sync
 *
 * POST body: { students: RosterRow[], dryRun: boolean }
 *
 * Synchronizes the student roster against a newly uploaded roster:
 *   - studentId already present  → update firstName/lastName/yearLevel/
 *                                   program/faculty and the resolved
 *                                   programId/facultyId, clear isDeleted if
 *                                   set.
 *   - studentId not present      → create a new student record.
 *   - studentId missing from the
 *     uploaded roster            → soft-delete: isDeleted = true, plus
 *                                   ARCHIVE that student's Fees, Fines, and
 *                                   Clearance Status for the active Academic
 *                                   Year/Semester. Records are hidden, never
 *                                   deleted: every org-app read already
 *                                   filters on the archive flag, so the effect
 *                                   matches deletion while remaining fully
 *                                   reversible, and the student's financial
 *                                   history survives. Previous semesters are
 *                                   outside the term filter and are never
 *                                   touched.
 *                                   Skipped entirely in additive-only mode.
 *
 * Runs entirely on the server using the Firebase Admin SDK — no client-side
 * Firestore writes are ever made by the UI for this operation.
 *
 * Restricted to authenticated super-admins: the session cookie is verified
 * (including revocation) and the caller's own `users/{uid}` document must
 * have role === "super-admin". This mirrors the check the client-side route
 * guard already performs, but re-asserted server-side since this endpoint
 * can create, modify, and soft-delete student records directly.
 *
 * DRY RUN (dryRun: true)   — computes the diff, writes nothing.
 * EXECUTE (dryRun: false)  — applies the diff in chunked batches.
 *
 * An active term is looked up the same way `/api/archive-students` does,
 * but — unlike that endpoint — its absence does not block the sync: roster
 * creates/updates still proceed, only the Fees/Fines/Clearance Status
 * cleanup for deactivated students is skipped (there being no term to scope
 * that cleanup to). `activeTerm: null` in the response signals this.
 *
 * ORGANIZATION MEMBERSHIP
 * Membership is not a stored orgId — the org app resolves it by querying
 * `users` on programId/facultyId. A roster carries human-readable program and
 * faculty names, so every row's names are resolved to those IDs before any
 * write (`resolveRosterReferences`); without that step a recorded program
 * shift would never actually move the student between organizations.
 *
 * SKIPPED ROWS
 * A row the roster could not use — unreadable on the client, or naming an
 * unknown program/faculty here — is skipped, not written. Absence from the
 * payload otherwise means "left the university", so every skipped student is
 * added to an exemption set and spared deactivation and record deletion:
 * `excludedStudentIds` from the client, plus whatever fails resolution here.
 * A row whose studentId itself is unreadable identifies nobody and therefore
 * cannot be exempted — the client blocks on those instead of submitting them.
 *
 * A student whose programId/facultyId changes is reported separately as a
 * TRANSFER. Writing those IDs is all a transfer requires — the org app resolves
 * membership by querying them — so no clearance or fee record is created here.
 * See the note above `fetchMatchingTermRecordIds` for why creating clearance
 * from this endpoint is actively harmful.
 *
 * BATCH LIMIT: Firestore max 500 ops/batch — chunked at 499 to be safe.
 * All writes (creates, updates, deactivations, and term-record deletes) are
 * queued into one combined op list before batching, so a failure partway
 * through is reported precisely via `partial`/`batchesCompleted`/
 * `batchesTotal`. Because new-student creation keys off the normalized
 * studentId and every other op is recomputed from a fresh read each run,
 * re-submitting the same roster after a partial failure is safe and will
 * only apply what didn't already land.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/firebase/firebase-admin.config";
import { FieldValue, type WriteBatch } from "firebase-admin/firestore";
import {
  BATCH_LIMIT,
  CLEARANCE_READ_CHUNK,
  DERIVED_EMAIL_DOMAIN,
  FIRESTORE_IN_QUERY_LIMIT,
  MAX_ROSTER_ROWS,
  STUDENT_ID_RE,
} from "@/features/super-admin/roster-sync/const";
import {
  planProvisions,
  clearanceStatusFor,
  buildClearanceId,
  studentBelongsToOrg,
  type FeeItemRef,
  type FineEventRef,
  type OrgRef,
} from "@/features/super-admin/roster-sync/utils/provisionPlan";
import { readStoredYearLevel } from "@/features/super-admin/roster-sync/utils/parseYearLevel";
import {
  deactivationRatio,
  exceedsDeactivationThreshold,
} from "@/features/super-admin/roster-sync/utils/deactivationGuard";
import { validateRosterRows } from "@/features/super-admin/roster-sync/utils/validateRosterRows";
import { normaliseStudentId } from "@/features/super-admin/roster-sync/utils/normaliseStudentId";
import { isSuperAdminRole } from "@/features/super-admin/roster-sync/utils/isSuperAdminRole";
import { chunkArray } from "@/features/super-admin/roster-sync/utils/chunkArray";
import { diffRoster, type ExistingStudent, type UpdateOp } from "@/features/super-admin/roster-sync/utils/diffRoster";
import {
  resolveRosterReferences,
  referenceKey,
  type RosterReferenceData,
} from "@/features/super-admin/roster-sync/utils/resolveRosterReferences";
import type { ActiveTerm, RawRosterRow, RosterRow } from "@/features/super-admin/roster-sync/types";

// ── Auth ──────────────────────────────────────────────────────────────────────

async function requireSuperAdmin(
  req: NextRequest
): Promise<
  | { ok: true; uid: string; actorName: string }
  | { ok: false; status: number; error: string }
> {
  const sessionCookie = req.cookies.get("session")?.value;
  if (!sessionCookie) {
    return { ok: false, status: 401, error: "Not authenticated." };
  }

  try {
    // checkRevoked so a signed-out/revoked super-admin can't keep using a
    // stale cookie against this endpoint.
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    const userDoc = await adminDb.collection("users").doc(decoded.uid).get();
    const data = userDoc.data();

    if (!userDoc.exists || !isSuperAdminRole(data?.role, data?.isDeleted)) {
      return { ok: false, status: 403, error: "Forbidden. Super-admin role required." };
    }

    // Captured for the synchronization log — an audit entry naming only a uid
    // is far less useful months later than one naming a person.
    const actorName =
      `${String(data?.firstName ?? "").trim()} ${String(data?.lastName ?? "").trim()}`.trim() ||
      String(data?.email ?? "").trim() ||
      decoded.uid;

    return { ok: true, uid: decoded.uid, actorName };
  } catch {
    return { ok: false, status: 401, error: "Invalid or expired session." };
  }
}

// ── Synchronization history ──────────────────────────────────────────────────

/** Collection holding one document per executed synchronization. Dry runs are
 *  never recorded — they change nothing, so they are not part of the history. */
const SYNC_LOG_COLLECTION = "rosterSyncLogs";

/** How many past runs the history endpoint returns. */
const SYNC_LOG_PAGE_SIZE = 20;

/**
 * Records a completed run.
 *
 * Written after the batches are committed, and deliberately outside the batch:
 * a partial failure still produced real changes, so the history must record
 * what happened rather than disappearing with the transaction. A failure to
 * write the log is swallowed — losing the audit entry is bad, but failing the
 * response after the data has already changed would be worse and would invite
 * an operator to re-run a sync that already succeeded.
 */
async function recordSyncRun(entry: Record<string, unknown>): Promise<void> {
  try {
    await adminDb.collection(SYNC_LOG_COLLECTION).add(entry);
  } catch (error) {
    console.error("[roster-sync API] failed to write synchronization log", error);
  }
}

/** Recent synchronization history, newest first. */
export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const snap = await adminDb
      .collection(SYNC_LOG_COLLECTION)
      .orderBy("completedAt", "desc")
      .limit(SYNC_LOG_PAGE_SIZE)
      .get();

    return NextResponse.json({
      entries: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    });
  } catch (error: any) {
    console.error("[roster-sync API] history read failed", error);
    return NextResponse.json(
      { error: "Failed to load synchronization history.", detail: error?.message },
      { status: 500 }
    );
  }
}

// ── Request validation ───────────────────────────────────────────────────────

interface RosterSyncRequestBody {
  students:           RawRosterRow[];
  dryRun:             boolean;
  excludedStudentIds: string[];
  /** Create, update and transfer only — no student is ever deactivated and no
   *  record is archived. Lets an incomplete roster be applied safely. */
  additiveOnly:       boolean;
  /** Explicit acknowledgement required when the deactivation share exceeds
   *  MAX_DEACTIVATION_RATIO — the signature of a partial roster upload. */
  acknowledgeMassDeactivation: boolean;
}

/**
 * Re-validates every row server-side — the client already validates before
 * submission, but this endpoint must never trust that: a request could be
 * sent directly, bypassing the UI entirely. Delegates the array-level
 * checks (shape, size, per-row validity, duplicate studentIds) to the pure,
 * unit-tested `validateRosterRows`; only the request envelope (`dryRun`) is
 * checked here.
 */
function validateRequestBody(
  body: unknown
):
  | {
      ok: true;
      rows: RosterRow[];
      dryRun: boolean;
      excludedStudentIds: string[];
      additiveOnly: boolean;
      acknowledgeMassDeactivation: boolean;
    }
  | { ok: false; status: number; error: string; details?: string[] } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, status: 400, error: "Request body must be a JSON object." };
  }

  const { students, dryRun, excludedStudentIds, additiveOnly, acknowledgeMassDeactivation } =
    body as Partial<RosterSyncRequestBody>;

  if (typeof dryRun !== "boolean") {
    return { ok: false, status: 400, error: "dryRun must be a boolean." };
  }
  if (additiveOnly !== undefined && typeof additiveOnly !== "boolean") {
    return { ok: false, status: 400, error: "additiveOnly must be a boolean." };
  }
  if (acknowledgeMassDeactivation !== undefined && typeof acknowledgeMassDeactivation !== "boolean") {
    return { ok: false, status: 400, error: "acknowledgeMassDeactivation must be a boolean." };
  }

  // Exemptions decide who is spared deactivation, so they are format-checked
  // like any other studentId — a malformed entry must not quietly widen or
  // narrow the set of students protected from record deletion.
  const excluded: string[] = [];
  if (excludedStudentIds !== undefined) {
    if (!Array.isArray(excludedStudentIds)) {
      return { ok: false, status: 400, error: "excludedStudentIds must be an array." };
    }
    if (excludedStudentIds.length > MAX_ROSTER_ROWS) {
      return { ok: false, status: 400, error: `excludedStudentIds exceeds the maximum of ${MAX_ROSTER_ROWS} entries.` };
    }
    for (const raw of excludedStudentIds) {
      const studentId = normaliseStudentId(String(raw ?? "").trim());
      if (!STUDENT_ID_RE.test(studentId)) {
        return { ok: false, status: 400, error: `Invalid studentId in excludedStudentIds: "${String(raw)}"` };
      }
      excluded.push(studentId);
    }
  }

  const validated = validateRosterRows(students);
  if (!validated.ok) {
    return { ok: false, status: 400, error: validated.error, details: validated.details };
  }

  return {
    ok: true,
    rows: validated.rows,
    dryRun,
    excludedStudentIds: excluded,
    additiveOnly: additiveOnly === true,
    acknowledgeMassDeactivation: acknowledgeMassDeactivation === true,
  };
}

// ── Firestore helpers ─────────────────────────────────────────────────────────

/** Two *live* records whose studentIds normalize to the same value — the
 *  database cannot say which one the roster row refers to. An archived record
 *  alongside a live one is not a collision: see `fetchExistingRoster`. */
export interface StudentIdCollision {
  studentId: string;
  docIds:    string[];
}

/**
 * Reads the entire current roster in one query — every `users` doc that has a
 * `studentId` field is a student record; org/super-admin accounts never set
 * that field, so this naturally scopes to students without a role flag.
 *
 * IDENTITY MATCHING: the stored studentId is normalized with the *same*
 * function applied to roster rows before it is used as the lookup key.
 * Normalizing only one side made matching an exact-string comparison between a
 * canonical value and a raw one, so a stored id in any other shape (a stray
 * space, a different dash) missed its roster row — which created a second
 * document for that student AND treated the original as departed, archiving
 * their records. Normalizing both sides closes that path.
 *
 * ARCHIVED PREDECESSORS ARE NOT COLLISIONS. A student can legitimately hold
 * the same Student ID twice: they graduate, their record is archived, and the
 * registrar re-enrols them under the same ID in a new program. The org app
 * creates a fresh record because its duplicate guard filters on
 * `isDeleted == false`, so the archived one is invisible to it — by design.
 *
 * Only two *live* records for one ID are genuinely ambiguous. Those are
 * reported so the caller can refuse to run rather than guess. An archived
 * predecessor alongside a live record is unambiguous: the live one is current,
 * and it is the one matched. Counting archived records here would block a sync
 * over ordinary graduate re-enrolment.
 *
 * The live record also always wins the map. Document order is arbitrary, so
 * letting the last write win could seat the *archived* record as the match —
 * `diffRoster` would then see `isDeleted: true`, mark it reactivated, and the
 * sync would revive the graduate's old record while leaving the student's real
 * one untouched.
 */
async function fetchExistingRoster(): Promise<{
  map: Map<string, ExistingStudent>;
  collisions: StudentIdCollision[];
}> {
  const snap = await adminDb.collection("users").where("studentId", "!=", "").get();
  const map = new Map<string, ExistingStudent>();
  const liveDocIds = new Map<string, string[]>();

  snap.docs.forEach((doc) => {
    const d = doc.data();
    const raw = String(d.studentId ?? "").trim();
    if (!raw) return;
    const studentId = normaliseStudentId(raw);
    const isDeleted = d.isDeleted === true;

    if (!isDeleted) {
      liveDocIds.set(studentId, [...(liveDocIds.get(studentId) ?? []), doc.id]);
    }

    // A live record always displaces an archived one; never the reverse.
    const seated = map.get(studentId);
    if (seated && !seated.isDeleted && isDeleted) return;

    // Read as a number, and flagged when not already an integer. Comparing the
    // stringified value would make every integer-stored student look "changed"
    // now that the roster side is a number; see `readStoredYearLevel`.
    const storedYearLevel = readStoredYearLevel(d.yearLevel);

    map.set(studentId, {
      docId: doc.id,
      studentId,
      firstName: String(d.firstName ?? ""),
      lastName: String(d.lastName ?? ""),
      yearLevel: storedYearLevel.value,
      yearLevelIsCanonical: storedYearLevel.canonical,
      program: String(d.program ?? ""),
      faculty: String(d.faculty ?? ""),
      programId: String(d.programId ?? ""),
      facultyId: String(d.facultyId ?? ""),
      isDeleted,
    });
  });

  const collisions: StudentIdCollision[] = [];
  for (const [studentId, docIds] of liveDocIds) {
    if (docIds.length > 1) collisions.push({ studentId, docIds });
  }

  return { map, collisions };
}

/**
 * Loads the programs/faculties lookup tables, keyed by both name and acronym
 * (rosters are hand-exported and use either form). Uses the Admin SDK rather
 * than the client-SDK helpers in `src/firebase/`, since this runs server-side.
 */
async function fetchReferenceData(): Promise<RosterReferenceData> {
  const [programsSnap, facultiesSnap] = await Promise.all([
    adminDb.collection("programs").get(),
    adminDb.collection("faculties").get(),
  ]);

  const programs = new Map<string, { id: string; facultyId: string }>();
  programsSnap.docs.forEach((doc) => {
    const d = doc.data();
    const entry = { id: doc.id, facultyId: String(d.facultyId ?? "") };
    for (const label of [d.name, d.acronym]) {
      const key = referenceKey(String(label ?? ""));
      if (key) programs.set(key, entry);
    }
  });

  const faculties = new Map<string, { id: string }>();
  facultiesSnap.docs.forEach((doc) => {
    const d = doc.data();
    const entry = { id: doc.id };
    for (const label of [d.name, d.acronym]) {
      const key = referenceKey(String(label ?? ""));
      if (key) faculties.set(key, entry);
    }
  });

  return { programs, faculties };
}

/*
 * PROVISIONING NEW STUDENTS
 *
 * A newly created student is given, for each subscribed organization they
 * belong to, the same things the org app gives a self-registration it approves:
 * a clearance record AND that organization's existing fees for the active term.
 *
 * The two must happen together. An earlier revision created clearance alone,
 * which was silently harmful: the org app writes clearance and *immediately*
 * assigns fees, so blockingItems are populated and the status is recalculated.
 * A clearance record with no fees reads as "cleared" while the student owes
 * money — and because the org app's bulk clearance generator skips anyone who
 * already has a record for the term, that empty record permanently prevented
 * the correct one from ever being generated.
 *
 * Fees are never duplicated: a fee is only written when the student does not
 * already hold one for that same fee template, so re-running a roster, or
 * recovering from a partially failed one, cannot charge anybody twice.
 *
 * Only newly CREATED students are provisioned. A transfer moves an existing
 * student between organizations, and what they then owe their new organization
 * — and whether they still owe the old one — is a decision for that
 * organization, not a side effect of a roster upload.
 */

/**
 * Due date stamped on a newly created clearance record. Mirrors the constant
 * the org app uses when it approves a self-registration, so a student
 * provisioned here is not given a different deadline from one provisioned
 * there. (The org app's bulk generator uses a *different* hardcoded date —
 * an inconsistency in that codebase, not one to propagate.)
 */
const CLEARANCE_DEFAULT_DUE_DATE = new Date("2026-12-30");

/** Days out to fall back to once the configured due date is in the past. */
const CLEARANCE_FALLBACK_WINDOW_DAYS = 120;

/**
 * The due date a newly created clearance record should carry.
 *
 * Mirrors `resolveClearanceDueDate` in the organization apps, including the
 * guard: once the configured date has passed, every clearance created after it
 * would otherwise be born overdue. Both applications write to the same
 * `clearanceStatus` collection, so a student provisioned by a roster sync must
 * not end up with a different deadline from one provisioned by the org app.
 */
function resolveClearanceDueDate(): Date {
  if (CLEARANCE_DEFAULT_DUE_DATE.getTime() > Date.now()) return CLEARANCE_DEFAULT_DUE_DATE;

  console.warn(
    `[roster-sync] CLEARANCE_DEFAULT_DUE_DATE (${CLEARANCE_DEFAULT_DUE_DATE
      .toISOString()
      .slice(0, 10)}) has passed — defaulting to ${CLEARANCE_FALLBACK_WINDOW_DAYS} days out so ` +
      `new clearances are not created overdue. Update it for the current academic calendar.`
  );

  return new Date(Date.now() + CLEARANCE_FALLBACK_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Address for a student the roster gives no email for.
 *
 * A student with no address cannot be contacted or later issued a login, so one
 * is always derived. Outside production the domain is deliberately fake, so a
 * test run can never deliver mail to a real student.
 */
function derivedEmailFor(studentId: string): string {
  return `${studentId}@${DERIVED_EMAIL_DOMAIN}`.toLowerCase();
}

/** Loads subscribed organizations. Unsubscribed orgs track no clearance. */
async function fetchSubscribedOrgs(): Promise<OrgRef[]> {
  const snap = await adminDb.collection("organizations").get();
  return snap.docs
    .filter((doc) => doc.data().subscribed === true)
    .map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        programId: (d.programId as string) ?? null,
        facultyId: (d.facultyId as string) ?? null,
        accessLevel: Number(d.accessLevel ?? 0),
      };
    });
}

/** Fee templates per organization for the active term, non-archived only. */
async function fetchFeeItemsByOrg(
  orgIds: string[],
  term: ActiveTerm
): Promise<Map<string, FeeItemRef[]>> {
  const byOrg = new Map<string, FeeItemRef[]>();

  for (const orgId of orgIds) {
    const snap = await adminDb
      .collection("feeItems")
      .where("orgId", "==", orgId)
      .where("isArchived", "==", false)
      .where("academicYear", "==", term.AY)
      .where("semester", "==", term.semester)
      .get();

    if (snap.empty) continue;

    byOrg.set(
      orgId,
      snap.docs.map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          orgId,
          title: String(d.title ?? ""),
          feeType: String(d.feeType ?? ""),
          amount: Number(d.amount ?? 0),
          description: String(d.description ?? ""),
          eventId: (d.eventId as string) ?? null,
          dueDate: d.dueDate ?? null,
          isRequiredForClearance: d.isRequiredForClearance === true,
          academicYear: String(d.academicYear ?? term.AY),
          semester: String(d.semester ?? term.semester),
        };
      })
    );
  }

  return byOrg;
}

/**
 * The events each organization has already generated fines for, priced from
 * their fine type.
 *
 * Mirrors the org app's `assignExistingFinesToStudent`: a student who joins
 * after generation has run missed those events, and the org app charges them on
 * arrival. Doing the same here keeps a roster-created student consistent with
 * one added through the members page.
 *
 * `requiresTimeOut` doubles the amount, matching how the org app prices an
 * absence from an event that needed both a time-in and a time-out.
 */
async function fetchFineEventsByOrg(
  orgIds: string[],
  term: ActiveTerm
): Promise<Map<string, FineEventRef[]>> {
  const byOrg = new Map<string, FineEventRef[]>();
  // Fine types are shared across events; resolved once and reused.
  const fineTypeCache = new Map<string, { name: string; amount: number } | null>();

  const resolveFineType = async (fineTypeId: string) => {
    if (fineTypeCache.has(fineTypeId)) return fineTypeCache.get(fineTypeId)!;
    const doc = await adminDb.collection("fineTypes").doc(fineTypeId).get();
    const data = doc.data();
    const resolved = doc.exists
      ? {
          name: String(data?.name ?? ""),
          amount:
            Number(data?.defaultAmount ?? 0) * (data?.requiresTimeOut === true ? 2 : 1),
        }
      : null;
    fineTypeCache.set(fineTypeId, resolved);
    return resolved;
  };

  for (const orgId of orgIds) {
    const snap = await adminDb
      .collection("events")
      .where("orgId", "==", orgId)
      .where("finesGenerated", "==", true)
      .where("isDeleted", "==", false)
      .where("academicYear", "==", term.AY)
      .where("semester", "==", term.semester)
      .get();

    if (snap.empty) continue;

    const events: FineEventRef[] = [];
    for (const doc of snap.docs) {
      const d = doc.data();
      const fineTypeId = String(d.fineTypeId ?? "");
      if (!fineTypeId) continue;

      const fineType = await resolveFineType(fineTypeId);
      // An event whose fine type has been deleted cannot be priced. Skipping is
      // the only safe option — inventing an amount would charge students money
      // nobody set.
      if (!fineType) continue;

      events.push({
        eventId: doc.id,
        orgId,
        eventName: String(d.name ?? "Unknown Event"),
        eventDate: d.date ?? null,
        fineTypeId,
        fineTypeName: fineType.name,
        amount: fineType.amount,
        academicYear: String(d.academicYear ?? term.AY),
        semester: String(d.semester ?? term.semester),
      });
    }

    if (events.length > 0) byOrg.set(orgId, events);
  }

  return byOrg;
}

/**
 * Which events each student has already been fined for, and the parent `fines`
 * document holding them.
 *
 * Fine items live in a subcollection of the parent, so both come from the same
 * read: the parent identifies where new items go, and its existing items say
 * which events to skip.
 */
async function fetchExistingFineState(
  userIds: string[],
  term: ActiveTerm
): Promise<{
  parentFineIds: Map<string, string>;
  finedEventIds: Map<string, Set<string>>;
}> {
  const parentFineIds = new Map<string, string>();
  const finedEventIds = new Map<string, Set<string>>();
  if (userIds.length === 0) return { parentFineIds, finedEventIds };

  for (let i = 0; i < userIds.length; i += FIRESTORE_IN_QUERY_LIMIT) {
    const chunk = userIds.slice(i, i + FIRESTORE_IN_QUERY_LIMIT);
    const snap = await adminDb
      .collection("fines")
      .where("userId", "in", chunk)
      .where("academicYear", "==", term.AY)
      .get();

    for (const doc of snap.docs) {
      const d = doc.data();
      // The org app writes the semester both bare and suffixed, so both forms
      // have to be accepted or a student gets a second parent document.
      const semester = String(d.semester ?? "");
      if (semester !== term.semester && semester !== `${term.semester} Semester`) continue;

      const userId = String(d.userId ?? "");
      const orgId = String(d.orgId ?? "");
      if (!userId || !orgId) continue;

      parentFineIds.set(`${userId}::${orgId}`, doc.id);

      const itemsSnap = await doc.ref.collection("fineItems").get();
      const seen = finedEventIds.get(userId) ?? new Set<string>();
      itemsSnap.docs.forEach((item) => {
        const eventId = item.data().eventId;
        if (eventId) seen.add(String(eventId));
      });
      finedEventIds.set(userId, seen);
    }
  }

  return { parentFineIds, finedEventIds };
}

/**
 * Which fee templates each student already holds, so none is written twice.
 *
 * Keyed by `userId` rather than `studentId`: a duplicated student would
 * otherwise pool both records' fees together and suppress a legitimate charge.
 */
async function fetchExistingFeeItemIds(
  userIds: string[],
  term: ActiveTerm
): Promise<Map<string, Set<string>>> {
  const held = new Map<string, Set<string>>();

  for (let i = 0; i < userIds.length; i += FIRESTORE_IN_QUERY_LIMIT) {
    const chunk = userIds.slice(i, i + FIRESTORE_IN_QUERY_LIMIT);
    const snap = await adminDb
      .collection("fees")
      .where("userId", "in", chunk)
      .where("academicYear", "==", term.AY)
      .where("semester", "==", term.semester)
      .get();

    snap.docs.forEach((doc) => {
      const d = doc.data();
      const userId = String(d.userId ?? "");
      const feeItemId = String(d.feeItemId ?? "");
      if (!userId || !feeItemId) return;
      held.set(userId, (held.get(userId) ?? new Set<string>()).add(feeItemId));
    });
  }

  return held;
}

/** Which of the candidate clearance records already exist. */
async function fetchExistingClearanceIds(ids: string[]): Promise<Set<string>> {
  const existing = new Set<string>();

  for (let i = 0; i < ids.length; i += CLEARANCE_READ_CHUNK) {
    const chunk = ids.slice(i, i + CLEARANCE_READ_CHUNK);
    const snaps = await adminDb.getAll(
      ...chunk.map((id) => adminDb.collection("clearanceStatus").doc(id))
    );
    snaps.forEach((snap) => {
      if (snap.exists) existing.add(snap.id);
    });
  }

  return existing;
}

/** Mirrors `/api/archive-students`' active-term lookup exactly. */
async function getActiveTerm(): Promise<ActiveTerm | null> {
  const snap = await adminDb
    .collection("terms")
    .where("isActive", "==", true)
    .where("isDeleted", "==", false)
    .limit(1)
    .get();

  if (snap.empty) return null;

  const doc = snap.docs[0];
  const data = doc.data();
  return { id: doc.id, AY: data.AY as string, semester: data.semester as string };
}

/**
 * Where each collection keeps its archive flag. These are not uniform: the org
 * app reads `isArchived` on fees and clearance but `metadata.isArchived` on
 * fines, so writing the wrong path would leave a record fully visible.
 *
 *   fees            → where("isArchived", "==", false)
 *   clearanceStatus → where("isArchived", "==", false)
 *   fines           → where("metadata.isArchived", "==", false)
 */
const ARCHIVE_FIELD: Record<string, string> = {
  fees:            "isArchived",
  fines:           "metadata.isArchived",
  clearanceStatus: "isArchived",
};

/** Reads a possibly-nested boolean (e.g. "metadata.isArchived") off a document. */
function readFlag(data: FirebaseFirestore.DocumentData, path: string): boolean {
  return path
    .split(".")
    .reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], data) === true;
}

/**
 * Finds every document in `collectionName` (fees/fines/clearanceStatus)
 * belonging to one of `studentIds` for the given Academic Year + Semester.
 *
 * Scoped to the active term only — records from previous semesters are never
 * matched and so are never touched, whatever happens to the student.
 *
 * Records already archived are excluded, so counts reflect real work and a
 * re-run of the same roster reports zero rather than re-archiving.
 */
async function fetchMatchingTermRecordIds(
  collectionName: string,
  studentIds: string[],
  AY: string,
  semester: string
): Promise<string[]> {
  if (studentIds.length === 0) return [];
  const archiveField = ARCHIVE_FIELD[collectionName];
  const ids: string[] = [];

  for (let i = 0; i < studentIds.length; i += FIRESTORE_IN_QUERY_LIMIT) {
    const chunk = studentIds.slice(i, i + FIRESTORE_IN_QUERY_LIMIT);
    const snap = await adminDb
      .collection(collectionName)
      .where("studentId", "in", chunk)
      .where("academicYear", "==", AY)
      .where("semester", "==", semester)
      .get();
    // Filtered in memory rather than in the query: adding an inequality on the
    // archive flag would need a new composite index per collection.
    snap.docs.forEach((d) => {
      if (!archiveField || !readFlag(d.data(), archiveField)) ids.push(d.id);
    });
  }

  return ids;
}

/**
 * Stamped on every record this endpoint archives, and the only marker it will
 * restore. A fee an organization archived deliberately carries a different
 * reason (or none) and is left alone — reviving it would overrule the treasurer
 * who put it away.
 */
const SYNC_ARCHIVE_REASON = "roster-sync: student absent from synchronized roster";

/** Queues the archive write for one record, honouring that collection's flag path. */
function queueArchive(batch: WriteBatch, collectionName: string, docId: string, now: Date): void {
  const archiveField = ARCHIVE_FIELD[collectionName];
  const update: Record<string, unknown> = {
    [archiveField]: true,
    archivedAt: now,
    archivedReason: SYNC_ARCHIVE_REASON,
  };
  if (archiveField.startsWith("metadata.")) update["metadata.updatedAt"] = now;
  else update.updatedAt = now;

  batch.update(adminDb.collection(collectionName).doc(docId), update);
}

/**
 * Finds the records a returning student should get back.
 *
 * The mirror of `fetchMatchingTermRecordIds`: same term scoping, opposite
 * archive state. Two conditions have to hold for a record to be restorable —
 * it is archived, and *this endpoint* is what archived it. Restoring anything
 * else would undo a deliberate decision made in the organization app.
 *
 * Term-scoped like everything else here, which is what keeps a previous
 * semester's fees and fines out of it: a student returning after a year away
 * gets this term's records back, not last year's dues.
 */
async function fetchRestorableTermRecordIds(
  collectionName: string,
  studentIds: string[],
  AY: string,
  semester: string
): Promise<string[]> {
  if (studentIds.length === 0) return [];
  const archiveField = ARCHIVE_FIELD[collectionName];
  const ids: string[] = [];

  for (let i = 0; i < studentIds.length; i += FIRESTORE_IN_QUERY_LIMIT) {
    const chunk = studentIds.slice(i, i + FIRESTORE_IN_QUERY_LIMIT);
    const snap = await adminDb
      .collection(collectionName)
      .where("studentId", "in", chunk)
      .where("academicYear", "==", AY)
      .where("semester", "==", semester)
      .get();
    snap.docs.forEach((d) => {
      const data = d.data();
      if (!archiveField || !readFlag(data, archiveField)) return;
      if (data.archivedReason !== SYNC_ARCHIVE_REASON) return;
      ids.push(d.id);
    });
  }

  return ids;
}

/** Queues the un-archive write, clearing the markers so the record is
 *  indistinguishable from one that was never archived. */
function queueRestore(batch: WriteBatch, collectionName: string, docId: string, now: Date): void {
  const archiveField = ARCHIVE_FIELD[collectionName];
  const update: Record<string, unknown> = {
    [archiveField]: false,
    archivedAt: FieldValue.delete(),
    archivedReason: FieldValue.delete(),
  };
  if (archiveField.startsWith("metadata.")) update["metadata.updatedAt"] = now;
  else update.updatedAt = now;

  batch.update(adminDb.collection(collectionName).doc(docId), update);
}

async function commitBatches(batches: WriteBatch[]): Promise<{ completed: number; error?: unknown }> {
  let completed = 0;
  for (const batch of batches) {
    try {
      await batch.commit();
      completed++;
    } catch (error) {
      return { completed, error };
    }
  }
  return { completed };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const validated = validateRequestBody(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error, details: validated.details }, { status: validated.status });
  }
  const { rows, dryRun, excludedStudentIds, additiveOnly, acknowledgeMassDeactivation } = validated;

  try {
    const [{ map: existing, collisions }, activeTerm, reference, subscribedOrgs] =
      await Promise.all([
        fetchExistingRoster(),
        getActiveTerm(),
        fetchReferenceData(),
        fetchSubscribedOrgs(),
      ]);

    // Ambiguous identity is never resolved by guessing: whichever record lost
    // the collision would be seen as departed and have its records archived.
    if (collisions.length > 0) {
      return NextResponse.json(
        {
          error:
            "Duplicate student records detected. Two or more ACTIVE accounts share the same " +
            "Student ID, so the roster cannot be matched unambiguously. Resolve these before " +
            "synchronizing. (An archived record from a previous enrolment is not counted here.)",
          details: collisions
            .slice(0, 50)
            .map((c) => `${c.studentId}: ${c.docIds.length} records (${c.docIds.join(", ")})`),
        },
        { status: 409 }
      );
    }

    // Names → IDs before anything is diffed or written. A row naming an
    // unknown program/faculty is skipped rather than written, and its student
    // joins the exemption set below so the skip cannot be mistaken for a
    // departure.
    const resolution = resolveRosterReferences(rows, reference);

    const exemptStudentIds = new Set<string>([
      ...excludedStudentIds,
      ...resolution.unresolvable.map((u) => u.studentId),
    ]);

    const rawPlan = diffRoster(resolution.rows, existing, exemptStudentIds);

    // Additive-only drops the entire destructive half of the plan: nobody is
    // deactivated, so nothing is archived either. An incomplete roster can then
    // be applied to fix transfers and add new students without betting on the
    // file being exhaustive.
    const plan = additiveOnly ? { ...rawPlan, toDeactivate: [] } : rawPlan;

    const deactivateStudentIds = plan.toDeactivate.map((op) => op.studentId);

    // A roster that would retire a large share of the student body is far more
    // likely to be a partial upload than a real graduation event.
    const activeStudentCount = [...existing.values()].filter((s) => !s.isDeleted).length;
    const massDeactivation = exceedsDeactivationThreshold(
      plan.toDeactivate.length,
      activeStudentCount
    );

    if (massDeactivation && !dryRun && !acknowledgeMassDeactivation) {
      const percent = Math.round(deactivationRatio(plan.toDeactivate.length, activeStudentCount) * 100);
      return NextResponse.json(
        {
          error:
            `Refusing to run: ${plan.toDeactivate.length} of ${activeStudentCount} active students ` +
            `(${percent}%) would be deactivated, which usually means the uploaded roster is ` +
            `incomplete. Re-check the file, or re-submit with acknowledgeMassDeactivation to ` +
            `proceed deliberately.`,
        },
        { status: 409 }
      );
    }
    const transfers: UpdateOp[] = plan.toUpdate.filter((op) => op.transferred);

    // Term-scoped cleanup only applies to students being deactivated this run
    // — mirrors archive-students, whose fee/fine/clearance cleanup applies to
    // the same set of students it archives.
    const [feeIds, fineIds, clearanceIds] = activeTerm
      ? await Promise.all([
          fetchMatchingTermRecordIds("fees", deactivateStudentIds, activeTerm.AY, activeTerm.semester),
          fetchMatchingTermRecordIds("fines", deactivateStudentIds, activeTerm.AY, activeTerm.semester),
          fetchMatchingTermRecordIds("clearanceStatus", deactivateStudentIds, activeTerm.AY, activeTerm.semester),
        ])
      : [[], [], []];

    // ── Restoring returning students ──────────────────────────────────────
    // A student who reappears in the roster is reactivated rather than created
    // afresh — `fetchExistingRoster` matches them by Student ID even while
    // archived. Their records come back with them, so the student is not left
    // live but stripped of the term's fees, fines and clearance.
    //
    // Only this term's records, and only ones this endpoint archived. Restoring
    // runs in additive-only mode too: giving a returning student their records
    // back retires nobody, which is the only thing that mode withholds.
    const reactivatedStudentIds = plan.toUpdate
      .filter((op) => op.reactivated)
      .map((op) => op.studentId);

    const [feeRestoreIds, fineRestoreIds, clearanceRestoreIds] = activeTerm
      ? await Promise.all([
          fetchRestorableTermRecordIds("fees", reactivatedStudentIds, activeTerm.AY, activeTerm.semester),
          fetchRestorableTermRecordIds("fines", reactivatedStudentIds, activeTerm.AY, activeTerm.semester),
          fetchRestorableTermRecordIds("clearanceStatus", reactivatedStudentIds, activeTerm.AY, activeTerm.semester),
        ])
      : [[], [], []];

    const recordsRestored =
      feeRestoreIds.length + fineRestoreIds.length + clearanceRestoreIds.length;

    // ── Provisioning for newly created students ───────────────────────────
    // A create's document ID is its studentId (see the create op below), so a
    // student can be provisioned in the same run that creates them.
    const provisionSubjects = [
      ...plan.toCreate.map(({ row }) => ({
        userId: row.studentId,
        studentId: row.studentId,
        userName: `${row.firstName} ${row.lastName}`.trim(),
        programId: row.programId,
        facultyId: row.facultyId,
      })),
      // Returning students are provisioned on the same terms as new ones.
      // Restoring their archived records is not enough on its own: a student
      // retired before their organization issued this term's dues has nothing
      // to restore, and the portal reads "not enrolled for the current term"
      // because that judgement is made on whether any clearance, fee, fine or
      // payment record exists for the term.
      //
      // Their document ID is the existing one, not the Student ID — only
      // created students are keyed by Student ID. `planProvisions` skips
      // anything they already hold, so a student whose records were restored a
      // moment ago is not charged for them twice.
      ...plan.toUpdate
        .filter((op) => op.reactivated)
        .map((op) => ({
          userId: op.docId,
          studentId: op.studentId,
          userName: `${op.firstName} ${op.lastName}`.trim(),
          programId: op.programId,
          facultyId: op.facultyId,
        })),
    ];

    let provisions: ReturnType<typeof planProvisions> = [];
    // Keyed `userId::orgId` — where an existing parent fines document was
    // found, new items are added to it rather than a second one being created.
    let existingParentFineIds = new Map<string, string>();
    if (activeTerm && provisionSubjects.length > 0 && subscribedOrgs.length > 0) {
      const relevantOrgIds = subscribedOrgs.map((o) => o.id);
      const [feeItemsByOrg, fineEventsByOrg, fineState] = await Promise.all([
        fetchFeeItemsByOrg(relevantOrgIds, activeTerm),
        fetchFineEventsByOrg(relevantOrgIds, activeTerm),
        fetchExistingFineState(provisionSubjects.map((s) => s.userId), activeTerm),
      ]);

      // Both lookups guard against writing something the student already has:
      // fees they already hold, and clearance records already in place.
      const [heldFeeItemIds, existingClearanceIds] = await Promise.all([
        fetchExistingFeeItemIds(
          provisionSubjects.map((s) => s.userId),
          activeTerm
        ),
        fetchExistingClearanceIds(
          provisionSubjects.flatMap((s) =>
            subscribedOrgs
              .filter((o) => studentBelongsToOrg(o, s.programId, s.facultyId))
              .map((o) => buildClearanceId(s.userId, o.id, activeTerm))
          )
        ),
      ]);

      provisions = planProvisions(
        provisionSubjects,
        subscribedOrgs,
        feeItemsByOrg,
        heldFeeItemIds,
        existingClearanceIds,
        activeTerm,
        fineEventsByOrg,
        fineState.finedEventIds
      );
      existingParentFineIds = fineState.parentFineIds;
    }

    const clearanceToCreate = provisions.filter((p) => !p.clearanceExists).length;
    const feesToAssign = provisions.reduce((n, p) => n + p.fees.length, 0);
    const finesToAssign = provisions.reduce((n, p) => n + p.fines.length, 0);

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        activeTerm,
        rosterRowsSubmitted: rows.length,
        toCreate: plan.toCreate.length,
        toUpdate: plan.toUpdate.length,
        toTransfer: transfers.length,
        toDeactivate: plan.toDeactivate.length,
        unchanged: plan.unchanged.length,
        exempted: plan.exempted.length,
        additiveOnly,
        massDeactivation,
        activeStudentCount,
        clearanceToCreate,
        feesToAssign,
        finesToAssign,
        reactivated: reactivatedStudentIds.length,
        recordsToRestore: recordsRestored,
        unresolvedRows: resolution.unresolvable.slice(0, 500),
        referenceWarnings: resolution.warnings.slice(0, 500),
        createPreview: plan.toCreate.slice(0, 500).map((op) => ({ studentId: op.row.studentId, fullName: `${op.row.firstName} ${op.row.lastName}`.trim() })),
        // Every new student's id, uncapped — `createPreview` is truncated for
        // display, but the export must cover the whole set. Ids only: the
        // client still holds the uploaded rows and rebuilds the file from
        // those, so the exported columns are the imported ones by construction.
        createStudentIds: plan.toCreate.map((op) => op.row.studentId),
        updatePreview: plan.toUpdate.slice(0, 500).map((op) => ({ studentId: op.studentId, fullName: `${op.firstName} ${op.lastName}`.trim(), reactivated: op.reactivated })),
        transferPreview: transfers.slice(0, 500).map((op) => ({
          studentId: op.studentId,
          fullName: `${op.firstName} ${op.lastName}`.trim(),
          fromProgram: op.fromProgram,
          toProgram: op.program,
        })),
        deactivatePreview: plan.toDeactivate.slice(0, 500).map((op) => ({ studentId: op.studentId, fullName: op.fullName })),
        matchingFees: feeIds.length,
        matchingFines: fineIds.length,
        matchingClearance: clearanceIds.length,
      });
    }

    const usersCol = adminDb.collection("users");
    const now = new Date();

    type QueuedOp = (batch: WriteBatch) => void;
    const ops: QueuedOp[] = [];

    for (const { row } of plan.toCreate) {
      ops.push((batch) =>
        batch.create(usersCol.doc(row.studentId), {
          studentId: row.studentId,
          firstName: row.firstName,
          lastName: row.lastName,
          yearLevel: row.yearLevel,
          program: row.program,
          faculty: row.faculty,
          programId: row.programId,
          facultyId: row.facultyId,
          // "user" — not "student": every organization member query filters on
          // role === "user", so any other value hides the student entirely.
          role: "user",
          // Same trap as role: the member lists, fine generation, clearance
          // generation and dashboard counts all filter status == "approved",
          // and a document MISSING the field matches no equality filter. Left
          // unset, a created student is invisible to the whole org app.
          // A registrar roster is authoritative, so "approved" is correct here
          // and matches what bulk import writes.
          status: "approved",
          email: row.email || derivedEmailFor(row.studentId),
          isActive: true,
          isDeleted: false,
          metadata: { createdAt: now, updatedAt: now },
        })
      );
    }

    // Note the absence of `email` and `status`: an update must never overwrite
    // them. A student who self-registered has a verified address of their own,
    // and clobbering it with one derived from their Student ID would send their
    // login and update links to a mailbox they may not read.
    for (const update of plan.toUpdate) {
      ops.push((batch) =>
        batch.update(usersCol.doc(update.docId), {
          firstName: update.firstName,
          lastName: update.lastName,
          yearLevel: update.yearLevel,
          program: update.program,
          faculty: update.faculty,
          programId: update.programId,
          facultyId: update.facultyId,
          isDeleted: false,
          "metadata.updatedAt": now,
        })
      );
    }

    // ── Clearance and fees for newly created students ─────────────────────
    // Written together: a clearance record whose blockingItems were never
    // populated reads as a cleared student who in fact owes money, and it
    // permanently blocks the org app from generating the correct one.
    const feeItemAssignments = new Map<string, number>();

    for (const provision of provisions) {
      const { subject, orgId, clearanceId, clearanceExists, fees, fines } = provision;
      const blockingItems: Record<string, unknown> = {};

      if (fines.length > 0) {
        // One parent `fines` document per student, organization and term, with
        // the individual charges as items beneath it — the shape the org app
        // reads. An existing parent is reused so a student never ends up with
        // two.
        const parentKey = `${subject.userId}::${orgId}`;
        const existingParentId = existingParentFineIds.get(parentKey);
        const parentRef = existingParentId
          ? adminDb.collection("fines").doc(existingParentId)
          : adminDb.collection("fines").doc();

        const total = fines.reduce((sum, f) => sum + f.event.amount, 0);
        const earliest = fines[0].event.eventDate ?? null;
        const latest = fines[fines.length - 1].event.eventDate ?? null;

        if (!existingParentId) {
          ops.push((batch) =>
            batch.create(parentRef, {
              orgId,
              userId: subject.userId,
              studentId: subject.studentId,
              userName: subject.userName,
              academicYear: activeTerm!.AY,
              semester: activeTerm!.semester,
              accumulatedAmount: total,
              paidAmount: 0,
              balance: total,
              status: "unpaid",
              fineItemsCount: fines.length,
              firstFineIssuedAt: earliest,
              lastFineIssuedAt: latest,
              dueDate: null,
              waivedAmount: null,
              waivedBy: null,
              waivedReason: null,
              waivedAt: null,
              remarks: null,
              metadata: { createdAt: now, updatedAt: now, isArchived: false },
            })
          );
        } else {
          // Increments rather than assignment: the parent already carries
          // charges this run knows nothing about.
          ops.push((batch) =>
            batch.update(parentRef, {
              accumulatedAmount: FieldValue.increment(total),
              balance: FieldValue.increment(total),
              fineItemsCount: FieldValue.increment(fines.length),
              lastFineIssuedAt: latest,
              "metadata.updatedAt": now,
            })
          );
        }

        fines.forEach(({ event }, index) => {
          const itemRef = parentRef.collection("fineItems").doc();
          ops.push((batch) =>
            batch.create(itemRef, {
              itemNumber: index + 1,
              fineTypeId: event.fineTypeId,
              fineTypeName: event.fineTypeName,
              eventId: event.eventId,
              eventName: event.eventName,
              eventDate: event.eventDate ?? null,
              amount: event.amount,
              reason: `Fine for being absent in event ${event.eventName}`,
              issuedBy: "Roster Synchronization",
              issuedAt: now,
              isWaived: false,
              waivedBy: null,
              waivedReason: null,
              waivedAt: null,
              appealNotes: null,
              appealedAt: null,
              appealStatus: null,
              appealResolvedAt: null,
              appealResolvedBy: null,
              metadata: { createdAt: now, updatedAt: now, isArchived: false },
              isPaid: false,
              isArchived: false,
              isPending: false,
              academicYear: event.academicYear,
              semester: event.semester,
              parentFineId: parentRef.id,
              userId: subject.userId,
              studentId: subject.studentId,
              userName: subject.userName,
              orgId,
            })
          );

          // Every fine blocks clearance — the org app files them all as
          // blocking items without asking whether they are required.
          blockingItems[itemRef.id] = {
            type: "fines",
            referenceId: itemRef.id,
            parentFineId: parentRef.id,
            title: event.eventName,
            balance: event.amount,
            status: "unpaid",
            paymentHistory: [],
            pendingReview: false,
            isRequiredForClearance: true,
            academicYear: event.academicYear,
            semester: event.semester,
          };
        });
      }

      for (const { feeItem } of fees) {
        const feeRef = adminDb.collection("fees").doc();

        ops.push((batch) =>
          batch.create(feeRef, {
            orgId,
            userId: subject.userId,
            userName: subject.userName,
            studentId: subject.studentId,
            feeItemId: feeItem.id,
            feeType: feeItem.feeType,
            title: feeItem.title,
            amount: feeItem.amount,
            paidAmount: 0,
            balance: feeItem.amount,
            status: "unpaid",
            academicYear: feeItem.academicYear,
            semester: feeItem.semester,
            description: feeItem.description,
            eventId: feeItem.eventId,
            dueDate: feeItem.dueDate ?? null,
            isRequiredForClearance: feeItem.isRequiredForClearance,
            createdBy: orgId,
            createdAt: now,
            updatedAt: now,
            isArchived: false,
          })
        );

        if (feeItem.isRequiredForClearance) {
          blockingItems[feeRef.id] = {
            type: "fees",
            referenceId: feeRef.id,
            title: feeItem.title,
            balance: feeItem.amount,
            status: "unpaid",
            paymentHistory: [],
            pendingReview: false,
            isRequiredForClearance: true,
            academicYear: feeItem.academicYear,
            semester: feeItem.semester,
          };
        }

        feeItemAssignments.set(feeItem.id, (feeItemAssignments.get(feeItem.id) ?? 0) + 1);
      }

      const clearanceRef = adminDb.collection("clearanceStatus").doc(clearanceId);

      if (clearanceExists) {
        // Merge only — an existing record carries live status and blocking
        // items that a re-run must not reset.
        if (Object.keys(blockingItems).length > 0) {
          ops.push((batch) =>
            batch.set(clearanceRef, { blockingItems, updatedAt: now }, { merge: true })
          );
        }
      } else {
        ops.push((batch) =>
          batch.create(clearanceRef, {
            id: clearanceId,
            orgId,
            userId: subject.userId,
            userName: subject.userName,
            studentId: subject.studentId,
            academicYear: activeTerm!.AY,
            semester: activeTerm!.semester,
            status: clearanceStatusFor(fees, fines),
            visibility: "public",
            blockingItems,
            clearanceDate: null,
            lastCalculatedAt: now,
            startDate: now,
            dueDate: resolveClearanceDueDate(),
            createdAt: now,
            updatedAt: now,
            isArchived: false,
          })
        );
      }
    }

    // One increment per template, not one per student: the org app increments
    // `totalStudents` per assignment, which is fine for a single approval but
    // would mean thousands of writes to the same document here — far past
    // Firestore's sustained per-document write limit.
    for (const [feeItemId, count] of feeItemAssignments) {
      ops.push((batch) =>
        batch.update(adminDb.collection("feeItems").doc(feeItemId), {
          totalStudents: FieldValue.increment(count),
          updatedAt: now,
        })
      );
    }

    // Per-organization student counts, matching what `onboardNewStudent` keeps
    // up to date in the organization apps. Without this the roster sync — by
    // far the highest-volume way a student is created — is the one path that
    // leaves the dashboards under-counting.
    //
    // Aggregated per organization for the same reason as the fee templates
    // above: one increment rather than one per student.
    //
    // `set` with merge, not `update`: the organization apps create the stats
    // document lazily on first use, so it may legitimately not exist yet and an
    // `update` would fail the whole batch. The other counters are seeded to
    // zero rather than left absent, so a document created here has the same
    // shape as one the org app would have written.
    if (activeTerm) {
      const studentsPerOrg = new Map<string, number>();
      for (const provision of provisions) {
        if (provision.clearanceExists) continue; // already counted on a previous run
        studentsPerOrg.set(provision.orgId, (studentsPerOrg.get(provision.orgId) ?? 0) + 1);
      }

      for (const [orgId, count] of studentsPerOrg) {
        const statsId = `${activeTerm.AY}-${activeTerm.semester}-${orgId}`;
        ops.push((batch) =>
          batch.set(
            adminDb.collection("stats").doc(statsId),
            {
              id: statsId,
              orgId,
              totalStudents: FieldValue.increment(count),
              totalFines: FieldValue.increment(0),
              totalFees: FieldValue.increment(0),
              totalCollectedFines: FieldValue.increment(0),
              totalCollectedFees: FieldValue.increment(0),
              totalUnpaidFines: FieldValue.increment(0),
              totalUnpaidFees: FieldValue.increment(0),
            },
            { merge: true }
          )
        );
      }
    }

    for (const deactivate of plan.toDeactivate) {
      ops.push((batch) =>
        batch.update(usersCol.doc(deactivate.docId), {
          isDeleted: true,
          "metadata.updatedAt": now,
        })
      );
    }

    // Archived, never deleted. The org app already filters every fee, fine and
    // clearance read on these flags, so archiving hides the record exactly as
    // deletion did — but a wrong deactivation is now fully reversible, and the
    // student's financial history survives.
    for (const id of feeIds) {
      ops.push((batch) => queueArchive(batch, "fees", id, now));
    }
    for (const id of fineIds) {
      ops.push((batch) => queueArchive(batch, "fines", id, now));
    }
    for (const id of clearanceIds) {
      ops.push((batch) => queueArchive(batch, "clearanceStatus", id, now));
    }

    // Returning students get this term's records back.
    for (const id of feeRestoreIds) {
      ops.push((batch) => queueRestore(batch, "fees", id, now));
    }
    for (const id of fineRestoreIds) {
      ops.push((batch) => queueRestore(batch, "fines", id, now));
    }
    for (const id of clearanceRestoreIds) {
      ops.push((batch) => queueRestore(batch, "clearanceStatus", id, now));
    }

    const batches = chunkArray(ops, BATCH_LIMIT).map((chunk) => {
      const batch = adminDb.batch();
      chunk.forEach((apply) => apply(batch));
      return batch;
    });

    const { completed, error } = await commitBatches(batches);
    const partial = completed < batches.length;

    if (error) {
      console.error("[roster-sync API] batch commit failed partway through", {
        actingUid: auth.uid,
        batchesCompleted: completed,
        batchesTotal: batches.length,
        error,
      });
    }

    const completedAt = new Date();

    const summary = {
      rosterRowsSubmitted: rows.length,
      toCreate: plan.toCreate.length,
      toUpdate: plan.toUpdate.length,
      toTransfer: transfers.length,
      toDeactivate: plan.toDeactivate.length,
      unchanged: plan.unchanged.length,
      exempted: plan.exempted.length,
      unresolvable: resolution.unresolvable.length,
      feesArchived: feeIds.length,
      finesArchived: fineIds.length,
      clearanceArchived: clearanceIds.length,
      clearanceCreated: clearanceToCreate,
      feesAssigned: feesToAssign,
      finesAssigned: finesToAssign,
      reactivated: reactivatedStudentIds.length,
      recordsRestored,
    };

    console.log("[roster-sync API] sync executed", { actingUid: auth.uid, ...summary, partial });

    await recordSyncRun({
      ...summary,
      completedAt,
      actingUid: auth.uid,
      actorName: auth.actorName,
      additiveOnly,
      acknowledgedMassDeactivation: massDeactivation && acknowledgeMassDeactivation,
      activeTerm: activeTerm ?? null,
      activeStudentCount,
      partial,
      batchesCompleted: completed,
      batchesTotal: batches.length,
      errorMessage: error ? String((error as Error)?.message ?? error) : null,
    });

    return NextResponse.json(
      {
        dryRun: false,
        activeTerm,
        rosterRowsSubmitted: rows.length,
        toCreate: plan.toCreate.length,
        toUpdate: plan.toUpdate.length,
        toTransfer: transfers.length,
        toDeactivate: plan.toDeactivate.length,
        unchanged: plan.unchanged.length,
        exempted: plan.exempted.length,
        additiveOnly,
        feesArchived: feeIds.length,
        finesArchived: fineIds.length,
        clearanceArchived: clearanceIds.length,
        clearanceCreated: clearanceToCreate,
        feesAssigned: feesToAssign,
        finesAssigned: finesToAssign,
        reactivated: reactivatedStudentIds.length,
        recordsRestored,
        completedAt: new Date().toISOString(),
        partial,
        batchesCompleted: completed,
        batchesTotal: batches.length,
        error: error ? "One or more batches failed to commit. Re-submitting the same roster is safe and will complete the remaining changes." : undefined,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[roster-sync API]", error);
    return NextResponse.json(
      { error: "Internal server error.", detail: error?.message ?? "Unknown error." },
      { status: 500 }
    );
  }
}
