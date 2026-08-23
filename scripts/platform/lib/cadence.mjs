const ADVISORY_ID_RE = /^ADV-(\d{4})(\d{2})(\d{2})-\d{2}$/;

const DAY_MS = 24 * 60 * 60 * 1000;

const CADENCE_DAYS = { security: 7, breaking: 30, bug: 30 };

export function advisoryIdDate(id) {
  const match = typeof id === "string" ? ADVISORY_ID_RE.exec(id) : null;
  if (!match) return null;
  const [, year, month, day] = match;
  return `${year}-${month}-${day}`;
}

export function ageDays(iso, now = Date.now()) {
  const then = Date.parse(`${iso}T00:00:00Z`);
  return Math.floor((now - then) / DAY_MS);
}

export function isOverdue(kind, days) {
  const limit = CADENCE_DAYS[kind];
  return limit !== undefined && days > limit;
}
