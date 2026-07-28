/**
 * Canonical class key for global quiz bank matching.
 * "1st", "Grade 1", "Class 1", "1" → "1"
 * "Pre Nursery" / "Pre-Nursery" → "pre-nursery"
 */

const ORDINAL_TO_NUM = {
  first: "1",
  second: "2",
  third: "3",
  fourth: "4",
  fifth: "5",
  sixth: "6",
  seventh: "7",
  eighth: "8",
  ninth: "9",
  tenth: "10",
  eleventh: "11",
  twelfth: "12",
};

const SPECIAL_ALIASES = {
  "pre nursery": "pre-nursery",
  "pre-nursery": "pre-nursery",
  prenursery: "pre-nursery",
  "pre primary": "pre-primary",
  "pre-primary": "pre-primary",
  preprimary: "pre-primary",
  nursery: "nursery",
  kg: "kg",
  "lkg": "lkg",
  "ukg": "ukg",
  "lower kg": "lkg",
  "upper kg": "ukg",
};

/**
 * @param {unknown} value - e.g. student.className or upload "Grade 1"
 * @returns {string|null} canonical key, or null if empty/unrecognized empty
 */
export function normalizeClassKey(value) {
  if (value === undefined || value === null) return null;
  let raw = String(value).trim().toLowerCase();
  if (!raw) return null;

  raw = raw
    .replace(/[_/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Strip common prefixes
  raw = raw
    .replace(/^(grade|class|std|standard|cls)\s*/i, "")
    .trim();

  // Special non-numeric labels
  const compact = raw.replace(/-/g, " ").replace(/\s+/g, " ").trim();
  if (SPECIAL_ALIASES[compact]) return SPECIAL_ALIASES[compact];
  if (SPECIAL_ALIASES[raw]) return SPECIAL_ALIASES[raw];

  // "1st", "2nd", "3rd", "4th"…
  const ordinalMatch = raw.match(/^(\d{1,2})(st|nd|rd|th)?$/i);
  if (ordinalMatch) {
    const n = Number(ordinalMatch[1]);
    if (n >= 1 && n <= 12) return String(n);
  }

  // "first", "second", …
  if (ORDINAL_TO_NUM[raw]) return ORDINAL_TO_NUM[raw];

  // Bare number embedded: "class 8", already stripped → "8"
  const numOnly = raw.match(/^(\d{1,2})$/);
  if (numOnly) {
    const n = Number(numOnly[1]);
    if (n >= 1 && n <= 12) return String(n);
  }

  // Fallback: slug of remaining text (stable match for custom labels)
  const slug = raw
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || null;
}

/**
 * Human label for SuperAdmin dropdowns (optional display).
 * @param {string} key
 */
export function classKeyToLabel(key) {
  if (!key) return "";
  if (/^\d{1,2}$/.test(key)) return `Grade ${key}`;
  if (key === "pre-nursery") return "Pre Nursery";
  if (key === "pre-primary") return "Pre Primary";
  if (key === "nursery") return "Nursery";
  if (key === "lkg") return "LKG";
  if (key === "ukg") return "UKG";
  if (key === "kg") return "KG";
  return key
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
