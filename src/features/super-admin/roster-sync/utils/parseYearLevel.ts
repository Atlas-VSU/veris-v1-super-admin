/**
 * Year level bounds, matching the student portal's own validation
 * (`z.coerce.number().min(1).max(6)` in add-student and update-student), so a
 * student synchronized from a roster can never hold a value the portal would
 * refuse on its own forms.
 */
export const MIN_YEAR_LEVEL = 1;
export const MAX_YEAR_LEVEL = 6;

export type YearLevelParse =
  | { ok: true; value: number }
  | { ok: false; reason: string };

/**
 * Accepts the shapes a hand-exported registrar roster actually uses —
 * "3", "3rd", "3rd Year", "3rd yr", "Year 3" — and nothing looser. Anchored on
 * both ends so a stray value like "3-4" or "2023" is rejected rather than having
 * its first digit quietly pulled out.
 */
const ORDINAL_FORM = /^(\d+)\s*(?:st|nd|rd|th)?\s*(?:year|yr)?\.?$/i;
const PREFIXED_FORM = /^(?:year|yr)\.?\s*(\d+)$/i;

/**
 * Parses a year level from a roster cell into the integer every other part of
 * the system stores.
 *
 * WHY A NUMBER. Every other onboarding path writes an integer: both
 * organization apps' bulk imports `parseInt` it, and the portal coerces it with
 * zod. Across the live student body it is stored as 0–6 without exception. The
 * organization app renders it with `yearLevel % 10` to pick an ordinal suffix,
 * so a string such as "3rd Year" displays as "3rd Yearth Year", and a mixed
 * population would make every roster sync see a "change" on students whose
 * year level had not moved.
 *
 * Words ("Third Year") are rejected rather than mapped. The set of spellings is
 * open-ended, and guessing wrong silently assigns a student to the wrong year —
 * a row that fails loudly is corrected in the file in seconds.
 */
export function parseYearLevel(raw: unknown): YearLevelParse {
  let value: number | null = null;

  if (typeof raw === "number") {
    value = Number.isInteger(raw) ? raw : null;
  } else {
    const text = (raw ?? "").toString().trim();
    if (!text) return { ok: false, reason: "Missing yearLevel" };

    const match = ORDINAL_FORM.exec(text) ?? PREFIXED_FORM.exec(text);
    if (match) value = Number.parseInt(match[1], 10);
  }

  if (value === null || Number.isNaN(value)) {
    return {
      ok: false,
      reason: `Invalid yearLevel: "${String(raw)}" — use a number such as 3, or "3rd Year".`,
    };
  }

  if (value < MIN_YEAR_LEVEL || value > MAX_YEAR_LEVEL) {
    return {
      ok: false,
      reason: `yearLevel ${value} is out of range — it must be between ${MIN_YEAR_LEVEL} and ${MAX_YEAR_LEVEL}.`,
    };
  }

  return { ok: true, value };
}

/**
 * Reads a year level already stored on a student record, for comparison against
 * the roster.
 *
 * Deliberately lenient where `parseYearLevel` is strict: this reads what is
 * there rather than judging new input, so it neither rejects nor range-checks.
 * A legacy 0 stays 0 and so differs from any real roster value, which is what
 * gets it corrected.
 *
 * `canonical` reports whether the stored value is already an integer. A value
 * stored as text is rewritten even when it parses to the same number, so the
 * collection converges on a single type instead of carrying both forever.
 */
export function readStoredYearLevel(raw: unknown): { value: number; canonical: boolean } {
  if (typeof raw === "number" && Number.isInteger(raw)) {
    return { value: raw, canonical: true };
  }

  const text = (raw ?? "").toString().trim();
  const match = ORDINAL_FORM.exec(text) ?? PREFIXED_FORM.exec(text);
  return { value: match ? Number.parseInt(match[1], 10) : 0, canonical: false };
}
