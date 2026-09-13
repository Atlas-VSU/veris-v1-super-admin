import { STUDENT_ID_RE } from "../const";

/**
 * Rebuilds a Student ID that Excel converted to a date.
 *
 * A Student ID is `YY-N-NNNNN`. When the first two segments happen to read as a
 * month and a day, Excel silently retypes the cell as a date: `07-1-00094`
 * becomes 1 July 1994, and the text originally typed is gone from the file.
 * The three parts survive inside the date, so the text can be rebuilt:
 *
 *   month → the two-digit prefix        (7      → "07")
 *   day   → the single middle digit     (1      → "1")
 *   year  → the five-digit suffix       (1994   → "00094")
 *
 * The suffix takes the year modulo 100 because Excel widened a two-digit year:
 * it read the `94` at the end of `00094` and resolved it to 1994, discarding
 * the leading zeros. Restoring them is what makes the result match the pattern
 * again.
 *
 * AMBIGUITY — the reason this returns a candidate, not an answer. The same date
 * can come from more than one Student ID: `07-1-00094` and `07-1-01994` both
 * resolve to 1 July 1994, and nothing in the file distinguishes them. The
 * common form (a sequence number under 100) is the one reconstructed, and the
 * caller must present it to the operator for confirmation rather than syncing
 * it unseen — writing the wrong ID here would attach the row to a different
 * student entirely.
 *
 * Returns null when the date cannot have come from a Student ID at all — a day
 * past 9 needs two digits and cannot sit in the single-digit middle segment, so
 * such a cell was never an ID and no candidate is offered.
 */
export function recoverDateStudentId(value: Date): string | null {
  if (Number.isNaN(value.getTime())) return null;

  const month = value.getMonth() + 1;
  const day = value.getDate();
  const year = value.getFullYear();

  const candidate =
    `${String(month).padStart(2, "0")}-${day}-${String(year % 100).padStart(5, "0")}`;

  return STUDENT_ID_RE.test(candidate) ? candidate : null;
}
