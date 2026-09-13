import type { RosterRow } from "../types";

/**
 * Export columns, in order, with the exact header labels `parseRosterFile`
 * names as canonical. Keeping these identical to the import format means an
 * exported file can be fed straight back in — to a second sync, or to the org
 * app's bulk import — without anyone having to rename a column.
 *
 * `email` is included even though the importer treats it as optional: a roster
 * export is most useful downstream where an address is expected, and a column
 * the importer ignores costs nothing.
 */
const EXPORT_COLUMNS: { key: keyof RosterRow; header: string }[] = [
  { key: "studentId", header: "Student ID" },
  { key: "firstName", header: "First Name" },
  { key: "lastName",  header: "Last Name" },
  { key: "yearLevel", header: "Year Level" },
  { key: "program",   header: "Program Name" },
  { key: "faculty",   header: "Faculty Name" },
  { key: "email",     header: "Email" },
];

/**
 * Quotes a value for CSV.
 *
 * Always quoting rather than only when necessary keeps a Student ID like
 * `07-1-00094` out of Excel's date parser on the way back in — the exact
 * corruption that turned three IDs into serial numbers on import. Embedded
 * quotes are doubled per RFC 4180.
 */
function toCsvField(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

/**
 * Renders roster rows as CSV in the same shape the importer accepts.
 *
 * Pure and dependency-free, so the column contract can be asserted in tests
 * rather than eyeballed in a downloaded file.
 */
export function buildRosterCsv(rows: RosterRow[]): string {
  const header = EXPORT_COLUMNS.map((c) => toCsvField(c.header)).join(",");
  const body = rows.map((row) =>
    EXPORT_COLUMNS.map((c) => toCsvField(row[c.key])).join(",")
  );
  // Trailing newline: some spreadsheet tools drop the final row without it.
  return [header, ...body].join("\r\n") + "\r\n";
}

/**
 * Selects the uploaded rows that the sync reported as new, preserving the file's
 * original order.
 *
 * The export is literally a subset of what was uploaded, so "same fields as the
 * import" holds by construction rather than by a mapping someone has to keep in
 * step with the importer.
 */
export function selectRowsByStudentId(rows: RosterRow[], studentIds: string[]): RosterRow[] {
  const wanted = new Set(studentIds);
  return rows.filter((row) => wanted.has(row.studentId));
}
