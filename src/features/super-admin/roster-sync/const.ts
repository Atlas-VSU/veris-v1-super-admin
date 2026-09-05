import { Upload, ListChecks, Eye, Zap, ClipboardList } from "lucide-react";

export const STEPS = [
  { key: "upload",   label: "Upload",   icon: Upload },
  { key: "validate", label: "Validate", icon: ListChecks },
  { key: "preview",  label: "Preview",  icon: Eye },
  { key: "execute",  label: "Execute",  icon: Zap },
  { key: "complete", label: "Complete", icon: ClipboardList },
] as const;

export const STUDENT_ID_RE = /^\d{2}-\d{1}-\d{5}$/;

export const MAX_FIELD_LENGTH = 150;

// Hard ceiling on rows accepted per request — guards against unbounded
// payloads exhausting server memory or Firestore quota in one call.
export const MAX_ROSTER_ROWS = 20000;

// Firestore allows a maximum of 500 operations per batch — chunk at 499
// to stay safely under the limit (matches the archive-students precedent).
export const BATCH_LIMIT = 499;

// Firestore `in` queries are limited to 30 values — matches the
// archive-students precedent for querying fees/fines/clearanceStatus.
export const FIRESTORE_IN_QUERY_LIMIT = 30;

// How many clearance documents to probe per `getAll` call when checking which
// already exist. Unlike `in` queries this has no hard Firestore ceiling; it is
// chunked only to bound the size of any single read.
export const CLEARANCE_READ_CHUNK = 200;

// Share of the active student body that may be deactivated in one run before
// the sync refuses without explicit acknowledgement. A genuine cohort leaving
// is a small fraction; a third of the university disappearing is the signature
// of a partial roster upload, which is the likeliest operator error.
export const MAX_DEACTIVATION_RATIO = 0.25;

// Below this count the ratio is meaningless — a handful of departures from a
// tiny dataset would otherwise trip the guard constantly.
export const MIN_DEACTIVATIONS_FOR_RATIO_CHECK = 25;

export type RosterColumn = "studentId" | "firstName" | "lastName" | "yearLevel" | "program" | "faculty";

// Recognised CSV/XLSX header aliases, normalised to lowercase with
// whitespace/underscores/hyphens collapsed to single spaces before lookup.
export const HEADER_ALIASES: Record<string, RosterColumn> = {
  "studentid": "studentId",
  "student id": "studentId",
  "student no": "studentId",
  "student number": "studentId",
  "id number": "studentId",
  "idno": "studentId",
  "id": "studentId",

  "firstname": "firstName",
  "first name": "firstName",
  "given name": "firstName",

  "lastname": "lastName",
  "last name": "lastName",
  "surname": "lastName",
  "family name": "lastName",

  "yearlevel": "yearLevel",
  "year level": "yearLevel",
  "year": "yearLevel",

  "program": "program",
  "program name": "program",
  "course": "program",

  "faculty": "faculty",
  "faculty name": "faculty",
  "college": "faculty",
  "department": "faculty",
};
