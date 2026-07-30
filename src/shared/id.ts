/**
 * Sortable id generator. Format: `YYYYMMDDHHmmssSSS` + random suffix.
 * Lexicographic sort == chronological sort, which keeps JSON diffs stable.
 */
function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0')
}

export function zid(random = true): string {
  const d = new Date()
  const stamp =
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds()) +
    pad(d.getMilliseconds(), 3)
  if (!random) return stamp
  const suffix = Math.random().toString(36).slice(2, 8)
  return `${stamp}_${suffix}`
}

/** ISO timestamp helper used across the data model. */
export function nowISO(): string {
  return new Date().toISOString()
}
