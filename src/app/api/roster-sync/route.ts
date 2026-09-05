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
 * TRANSFER, and — together with newly created students — is given a Clearance
 * Status record for each matching subscribed organization for the active term,
 * mirroring what the org app creates when it approves a self-registration.
 * Existing clearance records are never overwritten, so re-running a roster
 * neither duplicates nor resets them.
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
import type { WriteBatch } from "firebase-admin/firestore";
import {
  BATCH_LIMIT,
  CLEARANCE_READ_CHUNK,
  FIRESTORE_IN_QUERY_LIMIT,
  MAX_ROSTER_ROWS,
  STUDENT_ID_RE,
} from "@/features/super-admin/roster-sync/const";
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
): Promise<{ ok: true; uid: string } | { ok: false; status: number; error: string }> {
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

    return { ok: true, uid: decoded.uid };
  } catch {
    return { ok: false, status: 401, error: "Invalid or expired session." };
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

/** Two stored records whose studentIds normalize to the same value — the
 *  database cannot say which one the roster row refers to. */
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
 * Where two stored records collapse to the same normalized id, the database is
 * genuinely ambiguous: silently keeping one would leave the other unmatched
 * and therefore treated as departed. These are reported so the caller can
 * refuse to run rather than guess.
 */
async function fetchExistingRoster(): Promise<{
  map: Map<string, ExistingStudent>;
  collisions: StudentIdCollision[];
}> {
  const snap = await adminDb.collection("users").where("studentId", "!=", "").get();
  const map = new Map<string, ExistingStudent>();
  const seenDocIds = new Map<string, string[]>();

  snap.docs.forEach((doc) => {
    const d = doc.data();
    const raw = String(d.studentId ?? "").trim();
    if (!raw) return;
    const studentId = normaliseStudentId(raw);

    seenDocIds.set(studentId, [...(seenDocIds.get(studentId) ?? []), doc.id]);

    map.set(studentId, {
      docId: doc.id,
      studentId,
      firstName: String(d.firstName ?? ""),
      lastName: String(d.lastName ?? ""),
      yearLevel: String(d.yearLevel ?? ""),
      program: String(d.program ?? ""),
      faculty: String(d.faculty ?? ""),
      programId: String(d.programId ?? ""),
      facultyId: String(d.facultyId ?? ""),
      isDeleted: d.isDeleted === true,
    });
  });

  const collisions: StudentIdCollision[] = [];
  for (const [studentId, docIds] of seenDocIds) {
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

/** One organization, as needed to decide clearance membership. */
interface OrgRef {
  id:          string;
  programId:   string | null;
  facultyId:   string | null;
  accessLevel: number;
}

/** Subscribed organizations only — an unsubscribed org does not track clearance. */
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

/**
 * Whether a student belongs to an organization.
 *
 * Mirrors the org app's self-registration approval rule — program-level orgs
 * match on programId, faculty-level orgs on facultyId, and an org scoped to
 * neither is university-wide. The org app's own version of this condition has
 * its `&&`/`||` unparenthesized, so an *unsubscribed* org can match on
 * faculty; that is not reproduced here, since `fetchSubscribedOrgs` has
 * already excluded unsubscribed orgs.
 */
function studentBelongsToOrg(org: OrgRef, programId: string, facultyId: string): boolean {
  if (org.programId) return org.programId === programId;
  if (org.facultyId) return org.facultyId === facultyId;
  return true;
}

/** Deterministic clearance document ID — identical to the org app's
 *  `buildClearanceId`, so both apps address the same record. */
function buildClearanceId(
  userId: string,
  orgId: string,
  term: { AY: string; semester: string }
): string {
  return `${userId}${orgId}${`:${term.AY}-${term.semester}`.replace(/\s/g, "_")}`;
}

/** Mirrors the default the org app stamps on newly created clearance records. */
const CLEARANCE_DEFAULT_DUE_DATE = new Date("2026-12-30");

interface PendingClearance {
  id:        string;
  orgId:     string;
  userId:    string;
  userName:  string;
  studentId: string;
}

/**
 * Builds the clearance records needed so newly created and transferred
 * students appear in their organization for the active term.
 *
 * Records that already exist are skipped rather than overwritten — a clearance
 * doc carries live status and blocking items, and re-running a roster must
 * never reset them.
 */
async function planClearanceCreations(
  students: { userId: string; studentId: string; userName: string; programId: string; facultyId: string }[],
  orgs: OrgRef[],
  term: ActiveTerm
): Promise<PendingClearance[]> {
  const candidates: PendingClearance[] = [];

  for (const student of students) {
    for (const org of orgs) {
      if (!studentBelongsToOrg(org, student.programId, student.facultyId)) continue;
      candidates.push({
        id: buildClearanceId(student.userId, org.id, term),
        orgId: org.id,
        userId: student.userId,
        userName: student.userName,
        studentId: student.studentId,
      });
    }
  }

  if (candidates.length === 0) return [];

  // Skip any that already exist, read in chunks to bound each getAll call.
  const pending: PendingClearance[] = [];
  for (let i = 0; i < candidates.length; i += CLEARANCE_READ_CHUNK) {
    const chunk = candidates.slice(i, i + CLEARANCE_READ_CHUNK);
    const snaps = await adminDb.getAll(
      ...chunk.map((c) => adminDb.collection("clearanceStatus").doc(c.id))
    );
    snaps.forEach((snap, index) => {
      if (!snap.exists) pending.push(chunk[index]);
    });
  }

  return pending;
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

/** Queues the archive write for one record, honouring that collection's flag path. */
function queueArchive(batch: WriteBatch, collectionName: string, docId: string, now: Date): void {
  const archiveField = ARCHIVE_FIELD[collectionName];
  const update: Record<string, unknown> = {
    [archiveField]: true,
    archivedAt: now,
    archivedReason: "roster-sync: student absent from synchronized roster",
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
    const [{ map: existing, collisions }, activeTerm, reference, subscribedOrgs] = await Promise.all([
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
            "Duplicate student records detected. Two or more accounts share the same Student ID, " +
            "so the roster cannot be matched unambiguously. Resolve these before synchronizing.",
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

    // Newly created students and transferred students both need clearance
    // records for whichever organizations they now belong to. A create's
    // document ID is its studentId (see the create op below).
    const clearanceSubjects = [
      ...plan.toCreate.map(({ row }) => ({
        userId: row.studentId,
        studentId: row.studentId,
        userName: `${row.firstName} ${row.lastName}`.trim(),
        programId: row.programId,
        facultyId: row.facultyId,
      })),
      ...transfers.map((op) => ({
        userId: op.docId,
        studentId: op.studentId,
        userName: `${op.firstName} ${op.lastName}`.trim(),
        programId: op.programId,
        facultyId: op.facultyId,
      })),
    ];

    const pendingClearance = activeTerm
      ? await planClearanceCreations(clearanceSubjects, subscribedOrgs, activeTerm)
      : [];

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
        unresolvedRows: resolution.unresolvable.slice(0, 500),
        createPreview: plan.toCreate.slice(0, 500).map((op) => ({ studentId: op.row.studentId, fullName: `${op.row.firstName} ${op.row.lastName}`.trim() })),
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
        clearanceToCreate: pendingClearance.length,
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
          isActive: true,
          isDeleted: false,
          metadata: { createdAt: now, updatedAt: now },
        })
      );
    }

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

    // Clearance for students entering an organization. `create` (not `set`)
    // so a record that appeared between the existence probe and the commit is
    // never silently overwritten — the batch fails loudly instead, and
    // re-running skips whatever already landed.
    for (const clearance of pendingClearance) {
      ops.push((batch) =>
        batch.create(adminDb.collection("clearanceStatus").doc(clearance.id), {
          id: clearance.id,
          orgId: clearance.orgId,
          userId: clearance.userId,
          userName: clearance.userName,
          studentId: clearance.studentId,
          academicYear: activeTerm!.AY,
          semester: activeTerm!.semester,
          status: "cleared",
          visibility: "public",
          blockingItems: {},
          clearanceDate: null,
          lastCalculatedAt: now,
          startDate: now,
          dueDate: CLEARANCE_DEFAULT_DUE_DATE,
          createdAt: now,
          updatedAt: now,
          isArchived: false,
        })
      );
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

    console.log("[roster-sync API] sync executed", {
      actingUid: auth.uid,
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
      clearanceCreated: pendingClearance.length,
      partial,
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
        clearanceCreated: pendingClearance.length,
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
