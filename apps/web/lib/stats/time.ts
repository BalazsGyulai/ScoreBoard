// Calendar helpers in the group's time zone. Match timestamps are stored in UTC:
// a match finished at 00:30 on 1 January in Budapest is 23:30 UTC on 31 December,
// and must count for the new year. Server containers run in UTC and browsers can be
// anywhere, so stats never use Date#getFullYear()/getMonth() directly.

export const STATS_TIME_ZONE = "Europe/Budapest";

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: STATS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export interface LocalDate {
  year: number;
  /** 1–12 */
  month: number;
  day: number;
}

export function localDate(iso: string | Date): LocalDate {
  const parts = partsFormatter.formatToParts(typeof iso === "string" ? new Date(iso) : iso);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

export function localYear(iso: string | Date): number {
  return localDate(iso).year;
}

/** "2025-03" */
export function localMonthKey(iso: string | Date): string {
  const d = localDate(iso);
  return `${d.year}-${String(d.month).padStart(2, "0")}`;
}

/** Whole calendar days between two instants, counted on the Budapest calendar. */
export function localDaysBetween(from: string | Date, to: string | Date): number {
  const a = localDate(from);
  const b = localDate(to);
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000);
}

/** "ma" / "tegnap" / "5 napja" */
export function daysAgoLabel(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "nincs adat";
  const days = localDaysBetween(iso, now);
  if (days <= 0) return "ma";
  if (days === 1) return "tegnap";
  return `${days} napja`;
}

/** "2025. 03. 14." */
export function formatLocalDate(iso: string): string {
  return new Date(iso).toLocaleDateString("hu-HU", { timeZone: STATS_TIME_ZONE });
}

const monthNames = ["jan.", "febr.", "márc.", "ápr.", "máj.", "jún.", "júl.", "aug.", "szept.", "okt.", "nov.", "dec."];

/** The 12 month keys of a year, or the 12 months up to `now` when year is null. */
export function monthWindow(year: number | null, now: Date = new Date()): { key: string; label: string }[] {
  if (year !== null) {
    return monthNames.map((label, i) => ({ key: `${year}-${String(i + 1).padStart(2, "0")}`, label }));
  }
  const today = localDate(now);
  return Array.from({ length: 12 }, (_, i) => {
    const offset = today.month - 1 - (11 - i);
    const y = today.year + Math.floor(offset / 12);
    const m = ((offset % 12) + 12) % 12;
    return { key: `${y}-${String(m + 1).padStart(2, "0")}`, label: monthNames[m] };
  });
}
