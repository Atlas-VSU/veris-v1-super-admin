import * as XLSX from "xlsx";
import { HEADER_ALIASES, RosterColumn } from "../const";
import type { ParsedFileRow, RawRosterRow } from "../types";

function normaliseHeader(cell: unknown): string {
  return String(cell ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

/** Parses a CSV or XLSX file into a header row + data rows using SheetJS,
 *  which (unlike a naive comma-split) correctly handles quoted fields —
 *  important here since name fields can contain commas.
 *
 *  `cellDates` is on so that a cell Excel stored as a date arrives as a `Date`
 *  rather than its underlying serial number. Without it a Student ID like
 *  "07-1-00094" — which Excel reads as 1 July 1994 — reaches validation as the
 *  bare number 34516, and the operator is shown a value that appears nowhere in
 *  their file. See `formatDateCell`. */
function readSheetRows(buffer: string | ArrayBuffer, isCsv: boolean): unknown[][] {
  const workbook = isCsv
    ? XLSX.read(buffer as string, { type: "string", cellDates: true })
    : XLSX.read(buffer as ArrayBuffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
}

/** Renders a date-typed cell as YYYY-MM-DD so the operator can read the
 *  corruption back: 1994-07-01 is recognisably "07-1-00094" mangled. */
function formatDateCell(value: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

/**
 * Parses a roster CSV/XLSX file into raw row objects keyed by recognised
 * column name (studentId, firstName, lastName, yearLevel, program, faculty).
 *
 * Each row carries the row number **as the spreadsheet shows it** — the header
 * occupies row 1, and blank rows are dropped without shifting the count, so a
 * reported row can be opened directly in Excel. Numbering the surviving data
 * rows instead silently drifts by the header plus every blank row above.
 *
 * Throws if the file type is unsupported or a required column is missing —
 * fail fast rather than silently producing empty/garbage rows.
 */
export async function parseRosterFile(file: File): Promise<ParsedFileRow[]> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext !== "csv" && ext !== "xlsx" && ext !== "xls") {
    throw new Error("Unsupported file type. Please upload a .csv or .xlsx file.");
  }

  const rows =
    ext === "csv"
      ? readSheetRows(await file.text(), true)
      : readSheetRows(await file.arrayBuffer(), false);

  if (rows.length === 0) {
    throw new Error("The file is empty.");
  }

  const [headerRow, ...dataRows] = rows;
  const columnMap = new Map<number, RosterColumn>();
  headerRow.forEach((cell, index) => {
    const normalised = normaliseHeader(cell);
    const column = HEADER_ALIASES[normalised];
    if (column) columnMap.set(index, column);
  });

  const requiredColumns: RosterColumn[] = ["studentId", "firstName", "lastName", "yearLevel", "program", "faculty"];
  const foundColumns = new Set(columnMap.values());
  const missing = requiredColumns.filter((c) => !foundColumns.has(c));
  if (missing.length > 0) {
    throw new Error(
      `Missing required column(s): ${missing.join(", ")}. Expected headers: Student ID, First Name, Last Name, Year Level, Program Name, Faculty Name.`
    );
  }

  return dataRows
    // Row numbers are fixed before filtering: dropping a blank row must not
    // renumber everything below it.
    .map((row, index) => ({ row, excelRow: index + 2 }))
    .filter(({ row }) => row.some((cell) => String(cell ?? "").trim() !== ""))
    .map(({ row, excelRow }) => {
      const raw: RawRosterRow = {};
      const dateCoerced: RosterColumn[] = [];

      columnMap.forEach((column, index) => {
        const cell = row[index];
        if (cell instanceof Date) {
          // Excel converted this cell to a date on entry or save, so the text
          // originally typed is no longer in the file and cannot be recovered
          // here. Record it as a date so the reason shown names the real
          // problem instead of a number the operator has never seen.
          dateCoerced.push(column);
          raw[column] = formatDateCell(cell);
          return;
        }
        raw[column] = String(cell ?? "").trim();
      });

      return { excelRow, raw, dateCoerced };
    });
}
