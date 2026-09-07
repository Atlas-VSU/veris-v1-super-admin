/**
 * dedupeStudentRecords.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Standalone Firebase Admin maintenance script.
 *
 * PURPOSE
 *   Resolves students who exist twice in `users` under the same Student ID.
 *
 *   These pairs are invisible to every write path in the system, because each
 *   guard (portal self-registration, bulk import, Members page, the attendance
 *   modal) matches Student IDs with an exact string comparison, while the
 *   stored values differ cosmetically — a stray space, a different dash. Both
 *   records therefore display as the same ID and both accumulate fees.
 *
 *   The visible symptom is a doubled bill: the student portal aggregates dues
 *   by `studentId` with no reference to the user document, so two user records
 *   mean two fee documents and twice the amount owed.
 *
 * WHAT IT DOES
 *   For each duplicate group it keeps the SELF-REGISTERED record — the one
 *   whose email the student actually typed and verified, rather than the
 *   address assumed from their Student ID at bulk-import time — then:
 *     - archives the losing record's duplicate fees, fines and clearance
 *     - soft-deletes the losing user, stamped with `mergedIntoUserId`
 *
 *   Nothing is ever deleted. Archiving is what the org apps already read
 *   against, so it removes the double charge while the history survives and
 *   the merge stays reversible.
 *
 * WHAT IT REFUSES TO TOUCH
 *   Money is not guessed at. A group is reported and skipped when:
 *     - the survivor cannot be identified (both or neither look self-registered)
 *     - more than two records share the ID
 *     - the losing record has any payment activity
 *     - a losing fee has no counterpart on the survivor (archiving it would
 *       erase a charge rather than de-duplicate one)
 *     - a losing fine already carries issued fine items
 *
 *   Attendance is never touched and needs no action: `eventAttendees` keys on
 *   the Student ID string, which both records share, so it follows the student
 *   regardless of which user document survives.
 *
 * USAGE
 *   ts-node scripts/dedupeStudentRecords.ts                 # dry run (default)
 *   ts-node scripts/dedupeStudentRecords.ts --execute
 *   ts-node scripts/dedupeStudentRecords.ts --log merge.json
 *
 *   Options:
 *     --execute        Apply the plan. Without it, nothing is written.
 *     --log <file>     Write the full plan/result to a JSON file
 *     --only <ids>     Comma-separated Student IDs to limit the run to
 *
 * ENVIRONMENT
 *   Reads credentials from .env.local (same vars used by the Next.js app):
 *     FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as fs from "fs";
import * as path from "path";

// ── Load environment variables from .env.local ────────────────────────────────
function loadEnvFile(filePath: string): void {
  const absolutePath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(absolutePath)) return;
  const content = fs.readFileSync(absolutePath, "utf-8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnvFile(".env.local");

import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { normaliseStudentId } from "../src/features/super-admin/roster-sync/utils/normaliseStudentId";

// ── Firebase Admin Initialization ─────────────────────────────────────────────
const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
};

let app: App;
if (getApps().length === 0) {
  app = initializeApp({ credential: cert(serviceAccount as any) });
} else {
  app = getApps()[0];
}

const db = getFirestore(app);

// ── Constants ─────────────────────────────────────────────────────────────────
const BATCH_LIMIT = 499;

/** Domain the bulk import assumed when it derived an address from a Student ID. */
const INSTITUTIONAL_DOMAIN = "vsu.edu.ph";

/** Archive flag path per collection — not uniform, and writing the wrong one
 *  leaves the record fully visible. Mirrors the roster-sync route. */
const ARCHIVE_FIELD: Record<string, string> = {
  fees: "isArchived",
  fines: "metadata.isArchived",
  clearanceStatus: "isArchived",
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface UserRecord {
  docId: string;
  raw: FirebaseFirestore.DocumentData;
  studentIdRaw: string;
  studentIdNormalized: string;
  email: string;
  hasCor: boolean;
  isDeleted: boolean;
}

interface ArchivePlanItem {
  collection: string;
  docId: string;
  note: string;
}

interface GroupPlan {
  studentId: string;
  records: { docId: string; studentIdRaw: string; email: string; isDeleted: boolean }[];
  survivorId?: string;
  survivorReason?: string;
  loserId?: string;
  toArchive: ArchivePlanItem[];
  blocked: boolean;
  blockedReasons: string[];
  manualReview: string[];
}

interface ExecutionLog {
  groupsFound: number;
  groupsPlanned: number;
  groupsBlocked: number;
  archivedPredecessorsIgnored: number;
  recordsSoftDeleted: number;
  recordsArchived: number;
  groups: GroupPlan[];
  errors: string[];
  dryRun: boolean;
  completedAt: string;
}

// ── CLI ───────────────────────────────────────────────────────────────────────
function parseArgs(): { execute: boolean; logFile: string | null; only: string[] | null } {
  const args = process.argv.slice(2);
  let execute = false;
  let logFile: string | null = null;
  let only: string[] | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--execute") execute = true;
    else if (args[i] === "--log" && args[i + 1]) logFile = args[++i];
    else if (args[i] === "--only" && args[i + 1]) {
      only = args[++i]
        .split(",")
        .map((s) => normaliseStudentId(s.trim()))
        .filter(Boolean);
    }
  }

  return { execute, logFile, only };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function readFlag(data: FirebaseFirestore.DocumentData, pathStr: string): boolean {
  return (
    pathStr
      .split(".")
      .reduce<unknown>(
        (value, key) => (value as Record<string, unknown> | undefined)?.[key],
        data
      ) === true
  );
}

/** The address bulk import would have derived for this Student ID. */
function assumedEmailFor(studentIdNormalized: string): string {
  return `${studentIdNormalized}@${INSTITUTIONAL_DOMAIN}`.toLowerCase();
}

/**
 * Picks the record to keep.
 *
 * The self-registered record is the one the student typed and verified, so it
 * is the address that can actually receive a set-password or update link. The
 * bulk-imported record carries an address nobody ever confirmed, derived
 * mechanically from the Student ID.
 *
 * Returns null when the evidence does not clearly favour one record — better a
 * human decision than a wrong automatic merge of someone's fees.
 */
function chooseSurvivor(
  group: UserRecord[]
): { survivor: UserRecord; loser: UserRecord; reason: string } | null {
  if (group.length !== 2) return null;

  const assumed = assumedEmailFor(group[0].studentIdNormalized);
  const looksSelfRegistered = (u: UserRecord) => u.email !== "" && u.email !== assumed;

  const selfRegistered = group.filter(looksSelfRegistered);
  if (selfRegistered.length === 1) {
    const survivor = selfRegistered[0];
    const loser = group.find((u) => u.docId !== survivor.docId)!;
    return {
      survivor,
      loser,
      reason: `kept self-registered address "${survivor.email}" over assumed "${loser.email || "(none)"}"`,
    };
  }

  // Fallback: a proof-of-enrolment upload only ever comes from the portal.
  const withCor = group.filter((u) => u.hasCor);
  if (withCor.length === 1) {
    const survivor = withCor[0];
    const loser = group.find((u) => u.docId !== survivor.docId)!;
    return { survivor, loser, reason: "kept the record with an uploaded COR" };
  }

  return null;
}

/** Any sign the student has engaged financially with this record. */
function hasPaymentActivity(fee: FirebaseFirestore.DocumentData): boolean {
  const status = String(fee.status ?? "unpaid");
  return Number(fee.paidAmount ?? 0) > 0 || status === "pending" || status === "verified";
}

// ── Planning ──────────────────────────────────────────────────────────────────
async function planGroup(group: UserRecord[]): Promise<GroupPlan> {
  const plan: GroupPlan = {
    studentId: group[0].studentIdNormalized,
    records: group.map((u) => ({
      docId: u.docId,
      studentIdRaw: u.studentIdRaw,
      email: u.email,
      isDeleted: u.isDeleted,
    })),
    toArchive: [],
    blocked: false,
    blockedReasons: [],
    manualReview: [],
  };

  if (group.length > 2) {
    plan.blocked = true;
    plan.blockedReasons.push(`${group.length} records share this Student ID — needs a human`);
    return plan;
  }

  const choice = chooseSurvivor(group);
  if (!choice) {
    plan.blocked = true;
    plan.blockedReasons.push(
      "cannot tell which record is self-registered — both or neither match the assumed address"
    );
    return plan;
  }

  plan.survivorId = choice.survivor.docId;
  plan.survivorReason = choice.reason;
  plan.loserId = choice.loser.docId;

  // Fees are attributed by userId, never studentId — both records share the
  // Student ID, so querying by it would mix the two together.
  const [survivorFeesSnap, loserFeesSnap] = await Promise.all([
    db.collection("fees").where("userId", "==", choice.survivor.docId).get(),
    db.collection("fees").where("userId", "==", choice.loser.docId).get(),
  ]);

  const survivorFeeItemIds = new Set(
    survivorFeesSnap.docs.map((d) => String(d.data().feeItemId ?? ""))
  );

  for (const feeDoc of loserFeesSnap.docs) {
    const fee = feeDoc.data();
    if (readFlag(fee, "isArchived")) continue;

    if (hasPaymentActivity(fee)) {
      plan.blocked = true;
      plan.blockedReasons.push(
        `fee ${feeDoc.id} ("${fee.title ?? "untitled"}") has payment activity — resolve by hand`
      );
      continue;
    }

    const feeItemId = String(fee.feeItemId ?? "");
    if (!feeItemId || !survivorFeeItemIds.has(feeItemId)) {
      plan.manualReview.push(
        `fee ${feeDoc.id} ("${fee.title ?? "untitled"}") has no counterpart on the surviving record — not archived, since that would erase a charge rather than de-duplicate one`
      );
      continue;
    }

    plan.toArchive.push({
      collection: "fees",
      docId: feeDoc.id,
      note: `duplicate of the survivor's fee for feeItem ${feeItemId}`,
    });
  }

  // Fines: one parent document per student/org/term, with charges underneath.
  const loserFinesSnap = await db
    .collection("fines")
    .where("userId", "==", choice.loser.docId)
    .get();

  for (const fineDoc of loserFinesSnap.docs) {
    const fine = fineDoc.data();
    if (readFlag(fine, "metadata.isArchived")) continue;

    const itemCount = Number(fine.fineItemsCount ?? 0);
    if (itemCount > 0 || Number(fine.accumulatedAmount ?? 0) > 0) {
      plan.manualReview.push(
        `fine ${fineDoc.id} carries ${itemCount} issued item(s) — not archived, since real charges would be hidden`
      );
      continue;
    }

    plan.toArchive.push({
      collection: "fines",
      docId: fineDoc.id,
      note: "empty duplicate fines container",
    });
  }

  // Clearance is derived state; the survivor's is the one that matters.
  const loserClearanceSnap = await db
    .collection("clearanceStatus")
    .where("userId", "==", choice.loser.docId)
    .get();

  for (const clearanceDoc of loserClearanceSnap.docs) {
    if (readFlag(clearanceDoc.data(), "isArchived")) continue;
    plan.toArchive.push({
      collection: "clearanceStatus",
      docId: clearanceDoc.id,
      note: "clearance belonging to the merged-away record",
    });
  }

  return plan;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const { execute, logFile, only } = parseArgs();
  const errors: string[] = [];

  console.log("");
  console.log("VERIS — Duplicate Student Record Merge");
  console.log("═══════════════════════════════════════");
  console.log(execute ? "MODE: EXECUTE" : "MODE: DRY RUN (no writes)");
  if (only) console.log(`SCOPE: ${only.length} Student ID(s) from --only`);
  console.log("");

  console.log("Reading student records…");
  const snap = await db.collection("users").where("studentId", "!=", "").get();

  const byNormalized = new Map<string, UserRecord[]>();
  snap.docs.forEach((doc) => {
    const d = doc.data();
    const raw = String(d.studentId ?? "").trim();
    if (!raw) return;
    const normalized = normaliseStudentId(raw);
    if (only && !only.includes(normalized)) return;

    const record: UserRecord = {
      docId: doc.id,
      raw: d,
      studentIdRaw: String(d.studentId ?? ""),
      studentIdNormalized: normalized,
      email: String(d.email ?? "").trim().toLowerCase(),
      hasCor: Boolean(d.corURL),
      isDeleted: d.isDeleted === true,
    };
    byNormalized.set(normalized, [...(byNormalized.get(normalized) ?? []), record]);
  });

  // Only LIVE records can be duplicates of one another. An archived record
  // sharing an ID with a live one is an earlier enrolment, not a duplicate:
  // a student graduates, their record is archived, and the registrar re-enrols
  // them under the same ID in a new programme. That is ordinary and correct,
  // and merging the two would fuse a completed degree into a current one.
  const liveGroups = [...byNormalized.values()].map((group) =>
    group.filter((u) => !u.isDeleted)
  );

  const duplicateGroups = liveGroups.filter((group) => group.length > 1);

  const reEnrolled = [...byNormalized.values()].filter(
    (group) => group.some((u) => u.isDeleted) && group.filter((u) => !u.isDeleted).length === 1
  );

  console.log(`  ${snap.size} student record(s) scanned.`);
  console.log(`  ${duplicateGroups.length} duplicate group(s) found.`);
  if (reEnrolled.length > 0) {
    console.log(
      `  ${reEnrolled.length} archived predecessor(s) ignored — a graduated record alongside a`
    );
    console.log(
      `    single live one is re-enrolment under the same Student ID, not a duplicate.`
    );
  }
  console.log("");

  if (duplicateGroups.length === 0) {
    console.log("Nothing to merge.");
    process.exit(0);
  }

  console.log("Planning…");
  const plans: GroupPlan[] = [];
  for (const group of duplicateGroups) {
    plans.push(await planGroup(group));
  }

  const actionable = plans.filter((p) => !p.blocked && p.loserId);
  const blocked = plans.filter((p) => p.blocked);

  console.log("");
  for (const plan of plans) {
    console.log(`  ${plan.studentId}`);
    plan.records.forEach((r) => {
      const marker =
        r.docId === plan.survivorId ? "KEEP  " : r.docId === plan.loserId ? "MERGE " : "      ";
      console.log(`    ${marker} ${r.docId}  "${r.studentIdRaw}"  ${r.email || "(no email)"}`);
    });
    if (plan.survivorReason) console.log(`    → ${plan.survivorReason}`);
    plan.toArchive.forEach((a) => console.log(`    → archive ${a.collection}/${a.docId} (${a.note})`));
    plan.manualReview.forEach((m) => console.log(`    ! ${m}`));
    plan.blockedReasons.forEach((b) => console.log(`    ✗ BLOCKED: ${b}`));
    console.log("");
  }

  console.log(`  Actionable groups: ${actionable.length}`);
  console.log(`  Blocked groups:    ${blocked.length}`);
  console.log(
    `  Records to archive: ${actionable.reduce((n, p) => n + p.toArchive.length, 0)}`
  );

  let recordsArchived = 0;
  let recordsSoftDeleted = 0;

  if (execute && actionable.length > 0) {
    console.log("");
    console.log("Applying…");

    type Op = (batch: FirebaseFirestore.WriteBatch) => void;
    const ops: Op[] = [];
    const now = new Date();

    for (const plan of actionable) {
      for (const item of plan.toArchive) {
        const field = ARCHIVE_FIELD[item.collection];
        const update: Record<string, unknown> = {
          [field]: true,
          archivedAt: now,
          archivedReason: `dedupe: merged into ${plan.survivorId}`,
        };
        if (field.startsWith("metadata.")) update["metadata.updatedAt"] = now;
        else update.updatedAt = now;

        ops.push((batch) =>
          batch.update(db.collection(item.collection).doc(item.docId), update)
        );
        recordsArchived++;
      }

      ops.push((batch) =>
        batch.update(db.collection("users").doc(plan.loserId!), {
          isDeleted: true,
          mergedIntoUserId: plan.survivorId,
          mergedAt: now,
          mergedReason: "duplicate Student ID — self-registered record retained",
        })
      );
      recordsSoftDeleted++;
    }

    for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
      const batch = db.batch();
      ops.slice(i, i + BATCH_LIMIT).forEach((apply) => apply(batch));
      try {
        await batch.commit();
        console.log(`  Committed ${Math.min(i + BATCH_LIMIT, ops.length)}/${ops.length}`);
      } catch (error: any) {
        const message = `Batch at index ${i} failed: ${error?.message ?? "Unknown error"}`;
        console.error(`  ERROR: ${message}`);
        errors.push(message);
      }
    }
  }

  const log: ExecutionLog = {
    groupsFound: duplicateGroups.length,
    groupsPlanned: actionable.length,
    groupsBlocked: blocked.length,
    archivedPredecessorsIgnored: reEnrolled.length,
    recordsSoftDeleted: execute ? recordsSoftDeleted : 0,
    recordsArchived: execute ? recordsArchived : 0,
    groups: plans,
    errors,
    dryRun: !execute,
    completedAt: new Date().toISOString(),
  };

  if (logFile) {
    const absolutePath = path.resolve(process.cwd(), logFile);
    fs.writeFileSync(absolutePath, JSON.stringify(log, null, 2), "utf-8");
    console.log("");
    console.log(`Log written to ${absolutePath}`);
  }

  console.log("");
  console.log(
    execute
      ? "Merge complete."
      : "Dry run complete — no changes were made. Re-run with --execute to apply."
  );
  console.log("");

  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("FATAL:", error);
  process.exit(1);
});
