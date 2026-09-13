import * as XLSX from "xlsx";
import { HEADER_ALIASES, RosterColumn } from "../const";
import type { ParsedFileRow, RawRosterRow } from "../types";
import { recoverDateStudentId } from "./recoverDateStudentId";

function normaliseHeader(cell: unknown): string {
  return String(cell ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * Parses a CSV or XLSX file into a header row + data rows using SheetJS, which
 * (unlike a naive comma-split) correctly handles quoted fields — important here
 * since name fields can contain commas.
 *
 * THE TWO FORMATS ARE READ DIFFERENTLY, because the damage a date-shaped
 * Student ID suffers is only recoverable in one of them.
 *
 * CSV is plain text: the file still holds "07-1-00094" exactly as typed, and it
 * is only SheetJS's own type inference that would turn it into 1 July 1994.
 * `raw` switches that inference off, so every cell arrives as the text the file
 * actually contains. Nothing is guessed, and nothing needs recovering.
 *
 * XLSX has no such option. Excel converts the cell when the sheet is saved, so
 * the file stores a date serial and the typed text is already gone — reading it
 * raw yields 34516, which appears nowhere in the operator's file. `cellDates`
 * at least surfaces it as a `Date`, which is enough to recognise the problem,
 * report it against a recognisable value, and offer a reconstruction. See
 * `recoverDateStudentId`.
 *
 * Only IDs whose final segment reads as a plausible year are affected at all:
 * "07-1-00094" becomes a date, while "07-1-00343" and "22-1-00454" do not.
 */
function readSheetRows(buffer: string | ArrayBuffer, isCsv: boolean): unknown[][] {
  if (isCsv) {
    const workbook = XLSX.read(buffer as string, { type: "string", raw: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true });
  }

  const workbook = XLSX.read(buffer as ArrayBuffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
}

/**
 * Decodes CSV bytes to text, honouring the file's actual encoding.
 *
 * `File.text()` is specified to always decode as UTF-8. Excel on Windows saves
 * CSV as windows-1252 by default, where `ñ` is the single byte 0xF1 — invalid
 * on its own in UTF-8, so it decodes to U+FFFD and the original byte is gone.
 * That silently renamed 432 students ("Ibañez" → "Iba�ez") on a live sync.
 *
 * UTF-8 is tried first (strictly, so an invalid sequence throws rather than
 * being replaced) and windows-1252 is the fallback — it maps every byte to some
 * character, so it cannot fail and cannot produce U+FFFD. A UTF-8 BOM is an
 * explicit declaration and is trusted directly.
 */
async function readCsvText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const hasBom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const body = hasBom ? buffer.slice(3) : buffer;

  if (hasBom) return new TextDecoder("utf-8").decode(body);

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    return new TextDecoder("windows-1252").decode(body);
  }
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
      ? readSheetRows(await readCsvText(file), true)
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

      const recoveredStudentId: Partial<Record<RosterColumn, string>> = {};

      columnMap.forEach((column, index) => {
        const cell = row[index];
        if (cell instanceof Date) {
          // Excel converted this cell to a date on entry or save, so the text
          // originally typed is no longer in the file. Record it as a date so
          // the reason shown names the real problem instead of a serial number
          // the operator has never seen.
          dateCoerced.push(column);
          raw[column] = formatDateCell(cell);

          // A Student ID can be rebuilt from the date's parts. Offered as a
          // candidate only — see `recoverDateStudentId` for why it cannot be
          // trusted without the operator confirming it.
          if (column === "studentId") {
            const candidate = recoverDateStudentId(cell);
            if (candidate) recoveredStudentId.studentId = candidate;
          }
          return;
        }
        raw[column] = String(cell ?? "").trim();
      });

      return { excelRow, raw, dateCoerced, recovered: recoveredStudentId };
    });
}
