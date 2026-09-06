/**
 * backfillStudentOrgRefs.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Standalone Firebase Admin maintenance script.
 *
 * PURPOSE
 *   Repairs student records that cannot be seen by any organization.
 *
 *   Organization membership is not a stored orgId — the org app resolves it by
 *   querying `users` on `role`, `programId` and `facultyId`. Students created
 *   by earlier runs of Roster Synchronization were written with the display
 *   names `program`/`faculty` but no IDs, and with `role: "student"` instead of
 *   `"user"`, so they matched no organization's query at all.
 *
 *   This script finds those records and, for each one:
 *     - resolves `program`/`faculty` to `programId`/`facultyId`
 *     - corrects `role` to "user"
 *
 *   Records that already carry both IDs and the correct role are left alone,
 *   so the script is safe to re-run.
 *
 * SKIPPING IS SAFE HERE
 *   Unlike Roster Synchronization — where a student left out of the payload is
 *   deactivated and has their term records deleted — a student this script
 *   cannot resolve is simply left untouched and reported. Nothing is ever
 *   deleted, and no student is ever deactivated.
 *
 * USAGE
 *   ts-node scripts/backfillStudentOrgRefs.ts [--dry-run] [--log <path>]
 *
 *   Options:
 *     --dry-run         Report what would change without writing to Firestore
 *     --log    <file>   Write the execution log to a JSON file (optional)
 *
 * EXAMPLES
 *   ts-node scripts/backfillStudentOrgRefs.ts --dry-run
 *   ts-node scripts/backfillStudentOrgRefs.ts --log backfill-result.json
 *
 * ENVIRONMENT
 *   Reads credentials from .env.local (same vars used by the Next.js app):
 *     FIREBASE_PROJECT_ID
 *     FIREBASE_CLIENT_EMAIL
 *     FIREBASE_PRIVATE_KEY
 *
 * BATCH LIMIT
 *   Firestore allows a maximum of 500 operations per batch. Operations are
 *   chunked at 499 to stay safely under the limit.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as fs from "fs";
import * as path from "path";

// ── Load environment variables from .env.local ────────────────────────────────
// Manually parse .env.local without the dotenv package (not installed by default)
function loadEnvFile(filePath: string): void {
  const absolutePath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(absolutePath)) return;
  const content = fs.readFileSync(absolutePath, "utf-8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key   = trimmed.slice(0, eqIdx).trim();
    let   value = trimmed.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}
loadEnvFile(".env.local");

import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
// Shared with /api/roster-sync so the backfill and the sync agree on exactly
// what a program/faculty name resolves to. This module is deliberately free of
// runtime imports, so it is safe to pull into a standalone script.
import { referenceKey } from "../src/features/super-admin/roster-sync/utils/resolveRosterReferences";

// ── Firebase Admin Initialization ─────────────────────────────────────────────
const serviceAccount = {
  projectId:   process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
};

let app: App;
if (getApps().length === 0) {
  app = initializeApp({ credential: cert(serviceAccount as any) });
} else {
  app = getApps()[0];
}

const db = getFirestore(app);

// ── Constants ─────────────────────────────────────────────────────────────────
const BATCH_LIMIT = 499; // Use 499 to stay safely under the 500-op Firestore limit
const STUDENT_ROLE = "user"; // The role every organization member query filters on

// ── Types ─────────────────────────────────────────────────────────────────────
interface Repair {
  docId:     string;
  studentId: string;
  changes:   Record<string, string>;
  reasons:   string[];
}

interface Unresolvable {
  docId:     string;
  studentId: string;
  program:   string;
  faculty:   string;
  reason:    string;
}

interface ExecutionLog {
  studentsScanned:      number;
  studentsAlreadyValid: number;
  roleCorrected:        number;
  idsResolved:          number;
  studentsRepaired:     number;
  unresolvable:         Unresolvable[];
  errors:               string[];
  dryRun:               boolean;
  completedAt:          string;
}

// ── CLI Argument Parsing ───────────────────────────────────────────────────────
function parseArgs(): { dryRun: boolean; logFile: string | null } {
  const args = process.argv.slice(2);
  let dryRun  = false;
  let logFile: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") {
      dryRun = true;
    } else if (args[i] === "--log" && args[i + 1]) {
      logFile = args[i + 1];
      i++;
    }
  }

  return { dryRun, logFile };
}

// ── Reference Data ────────────────────────────────────────────────────────────
interface ReferenceMaps {
  programs:  Map<string, { id: string; facultyId: string }>;
  faculties: Map<string, { id: string }>;
}

/** Keyed by both name and acronym — identical to the API route's loader. */
async function loadReferenceData(): Promise<ReferenceMaps> {
  const [programsSnap, facultiesSnap] = await Promise.all([
    db.collection("programs").get(),
    db.collection("faculties").get(),
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

  console.log(`  Loaded ${programs.size} program key(s) and ${faculties.size} faculty key(s).`);
  return { programs, faculties };
}

// ── Repair Planning ───────────────────────────────────────────────────────────
function planRepairs(
  docs: FirebaseFirestore.QueryDocumentSnapshot[],
  reference: ReferenceMaps
): { repairs: Repair[]; unresolvable: Unresolvable[]; alreadyValid: number } {
  const repairs: Repair[] = [];
  const unresolvable: Unresolvable[] = [];
  let alreadyValid = 0;

  for (const doc of docs) {
    const d         = doc.data();
    const studentId = String(d.studentId ?? "");
    const program   = String(d.program ?? "");
    const faculty   = String(d.faculty ?? "");
    const programId = String(d.programId ?? "");
    const facultyId = String(d.facultyId ?? "");
    const role      = String(d.role ?? "");

    const changes: Record<string, string> = {};
    const reasons: string[] = [];

    if (role !== STUDENT_ROLE) {
      changes.role = STUDENT_ROLE;
      reasons.push(`role "${role || "(missing)"}" → "${STUDENT_ROLE}"`);
    }

    if (!programId || !facultyId) {
      // Only records missing an ID are resolved; an existing ID is authoritative
      // and is never second-guessed from a display name.
      if (!program) {
        unresolvable.push({ docId: doc.id, studentId, program, faculty, reason: "no program name on record" });
        continue;
      }

      const resolvedProgram = reference.programs.get(referenceKey(program));
      if (!resolvedProgram) {
        unresolvable.push({ docId: doc.id, studentId, program, faculty, reason: `unknown program "${program}"` });
        continue;
      }

      const resolvedFaculty = faculty ? reference.faculties.get(referenceKey(faculty)) : undefined;
      const nextFacultyId   = resolvedProgram.facultyId || resolvedFaculty?.id || "";
      if (!nextFacultyId) {
        unresolvable.push({ docId: doc.id, studentId, program, faculty, reason: `cannot determine faculty for program "${program}"` });
        continue;
      }

      if (!programId) {
        changes.programId = resolvedProgram.id;
        reasons.push(`programId → ${resolvedProgram.id}`);
      }
      if (!facultyId) {
        changes.facultyId = nextFacultyId;
        reasons.push(`facultyId → ${nextFacultyId}`);
      }
    }

    if (Object.keys(changes).length === 0) {
      alreadyValid++;
      continue;
    }

    repairs.push({ docId: doc.id, studentId, changes, reasons });
  }

  return { repairs, unresolvable, alreadyValid };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const { dryRun, logFile } = parseArgs();

  console.log("");
  console.log("VERIS — Backfill Student Organization References");
  console.log("════════════════════════════════════════════════");
  console.log(dryRun ? "MODE: DRY RUN (no writes)" : "MODE: EXECUTE");
  console.log("");

  const errors: string[] = [];

  console.log("Loading reference data…");
  const reference = await loadReferenceData();

  console.log("Reading student records…");
  const snap = await db.collection("users").where("studentId", "!=", "").get();
  console.log(`  Found ${snap.size} student record(s).`);

  const { repairs, unresolvable, alreadyValid } = planRepairs(snap.docs, reference);

  const roleCorrected = repairs.filter((r) => "role" in r.changes).length;
  const idsResolved   = repairs.filter((r) => "programId" in r.changes || "facultyId" in r.changes).length;

  console.log("");
  console.log(`  Already correct:      ${alreadyValid}`);
  console.log(`  To repair:            ${repairs.length}`);
  console.log(`    · role corrections: ${roleCorrected}`);
  console.log(`    · ID resolutions:   ${idsResolved}`);
  console.log(`  Unresolvable:         ${unresolvable.length}`);

  if (unresolvable.length > 0) {
    console.log("");
    console.log("  These records were left untouched (nothing is deleted or deactivated):");
    unresolvable.slice(0, 50).forEach((u) => {
      console.log(`    ${u.studentId || u.docId}: ${u.reason}`);
    });
    if (unresolvable.length > 50) {
      console.log(`    …and ${unresolvable.length - 50} more (see --log for the full list).`);
    }
  }

  if (!dryRun && repairs.length > 0) {
    console.log("");
    console.log("Writing repairs…");
    const now = new Date();

    for (let i = 0; i < repairs.length; i += BATCH_LIMIT) {
      const chunk = repairs.slice(i, i + BATCH_LIMIT);
      const batch = db.batch();
      chunk.forEach((repair) => {
        batch.update(db.collection("users").doc(repair.docId), {
          ...repair.changes,
          "metadata.updatedAt": now,
        });
      });

      try {
        await batch.commit();
        console.log(`  Committed ${Math.min(i + BATCH_LIMIT, repairs.length)}/${repairs.length}`);
      } catch (error: any) {
        const message = `Batch starting at index ${i} failed: ${error?.message ?? "Unknown error"}`;
        console.error(`  ERROR: ${message}`);
        errors.push(message);
      }
    }
  }

  const log: ExecutionLog = {
    studentsScanned:      snap.size,
    studentsAlreadyValid: alreadyValid,
    roleCorrected,
    idsResolved,
    studentsRepaired:     dryRun ? 0 : repairs.length - errors.length,
    unresolvable,
    errors,
    dryRun,
    completedAt:          new Date().toISOString(),
  };

  if (logFile) {
    const absolutePath = path.resolve(process.cwd(), logFile);
    fs.writeFileSync(absolutePath, JSON.stringify(log, null, 2), "utf-8");
    console.log("");
    console.log(`Log written to ${absolutePath}`);
  }

  console.log("");
  console.log(dryRun ? "Dry run complete — no changes were made." : "Backfill complete.");
  console.log("");

  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("FATAL:", error);
  process.exit(1);
});
