import * as XLSX from "xlsx";
import { HEADER_ALIASES, RosterColumn } from "../const";
import type { RawRosterRow } from "../types";

function normaliseHeader(cell: unknown): string {
  return String(cell ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

/** Parses a CSV or XLSX file into a header row + data rows using SheetJS,
 *  which (unlike a naive comma-split) correctly handles quoted fields —
 *  important here since name fields can contain commas. */
function readSheetRows(buffer: string | ArrayBuffer, isCsv: boolean): unknown[][] {
  const workbook = isCsv
    ? XLSX.read(buffer as string, { type: "string" })
    : XLSX.read(buffer as ArrayBuffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
}

/**
 * Parses a roster CSV/XLSX file into raw row objects keyed by recognised
 * column name (studentId, firstName, lastName, yearLevel, program, faculty).
 *
 * Throws if the file type is unsupported or a required column is missing —
 * fail fast rather than silently producing empty/garbage rows.
 */
export async function parseRosterFile(file: File): Promise<RawRosterRow[]> {
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
    .filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""))
    .map((row) => {
      const raw: RawRosterRow = {};
      columnMap.forEach((column, index) => {
        raw[column] = String(row[index] ?? "").trim();
      });
      return raw;
    });
}
