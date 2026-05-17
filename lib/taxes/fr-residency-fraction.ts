/**
 * Residence-proxy fraction of acquisition income treated as "France"
 * for French report rows. See design doc:
 * docs/superpowers/specs/2026-05-17-report-fr-residency-fraction-design.md
 */

const MS_PER_DAY = 86_400_000;

export type AbroadInterval = { start: string; end: string };

export function utcMillisFromIsoDate(iso: string): number {
  const parts = iso.split("-").map(Number);
  if (parts.length !== 3) return Number.NaN;
  const [y, m, d] = parts;
  if (!y || !m || !d) return Number.NaN;
  return Date.UTC(y, m - 1, d);
}

/** Inclusive calendar-day count; returns 0 if invalid or start > end. */
export function inclusiveDayCount(startIso: string, endIso: string): number {
  const a = utcMillisFromIsoDate(startIso);
  const b = utcMillisFromIsoDate(endIso);
  if (Number.isNaN(a) || Number.isNaN(b) || a > b) return 0;
  return Math.floor((b - a) / MS_PER_DAY) + 1;
}

/**
 * Merges overlapping or same-day-touching inclusive intervals (ISO dates).
 * Ignores entries with empty start/end or start > end.
 */
export function mergeAbroadIntervals(
  abroad: AbroadInterval[],
): AbroadInterval[] {
  const sorted = [...abroad]
    .filter((i) => i.start && i.end && i.start <= i.end)
    .sort(
      (x, y) => x.start.localeCompare(y.start) || x.end.localeCompare(y.end),
    );
  const out: AbroadInterval[] = [];
  for (const cur of sorted) {
    const last = out[out.length - 1];
    if (!last) {
      out.push({ ...cur });
      continue;
    }
    if (cur.start <= last.end) {
      last.end = cur.end > last.end ? cur.end : last.end;
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

export function clipIntervalToWindow(
  interval: AbroadInterval,
  windowStart: string,
  windowEnd: string,
): AbroadInterval | null {
  const s = interval.start > windowStart ? interval.start : windowStart;
  const e = interval.end < windowEnd ? interval.end : windowEnd;
  if (s > e) return null;
  return { start: s, end: e };
}

export function validateAbroadPeriodsForUi(
  abroad: AbroadInterval[],
): string | null {
  for (const row of abroad) {
    const hasStart = Boolean(row.start);
    const hasEnd = Boolean(row.end);
    if (hasStart !== hasEnd) {
      return "Each abroad period must have both start and end dates";
    }
    if (hasStart && row.start > row.end) {
      return "Abroad end date must be on or after the start date";
    }
  }
  return null;
}

export function fractionFrIncomeFromResidency(params: {
  dateGranted: string;
  dateAcquired: string;
  abroad: AbroadInterval[];
}): { ok: true; fraction: number } | { ok: false; error: string } {
  const { dateGranted: g, dateAcquired: a, abroad } = params;
  if (!g || !a) {
    return { ok: false, error: "Missing grant or acquisition date" };
  }
  if (a < g) {
    return {
      ok: false,
      error: "Acquisition date is before grant date for at least one row",
    };
  }

  const total = inclusiveDayCount(g, a);
  if (total <= 0) {
    return { ok: false, error: "Invalid grant or acquisition date" };
  }

  const merged = mergeAbroadIntervals(abroad);
  let abroadDaysInWindow = 0;
  for (const interval of merged) {
    const clipped = clipIntervalToWindow(interval, g, a);
    if (clipped) {
      abroadDaysInWindow += inclusiveDayCount(clipped.start, clipped.end);
    }
  }

  const cappedAbroad = Math.min(abroadDaysInWindow, total);
  const frDays = total - cappedAbroad;
  const fraction = frDays / total;
  return { ok: true, fraction: Math.min(1, Math.max(0, fraction)) };
}
