// this function takes a raw student ID string and normalizes it into a standard format. The expected format is "XX-X-XXXXX" where X represents a digit. If the input string contains exactly 8 digits, it will be reformatted accordingly. If not, the original trimmed string will be returned.

export function normaliseStudentId(raw: string): string {
  const digits = raw.trim().replace(/\D/g, "");
  if (digits.length === 8) {
    return `${digits.slice(0, 2)}-${digits[2]}-${digits.slice(3)}`;
  }
  return raw.trim();
}
