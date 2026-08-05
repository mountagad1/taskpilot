// ============================================================
// TASKPILOT — CRON SCHEDULING
// services/api/src/lib/cron.ts
//
// A small 5-field cron parser. Pulling in a scheduling library for this
// would add a dependency to the edge bundle for something the workflow
// engine only needs in one shape: "when is the next occurrence, in UTC".
//
// Supported per field: *, N, N-M, N-M/S, */S, and comma-separated lists.
// ============================================================

export interface CronFields {
  minutes: number[];
  hours: number[];
  daysOfMonth: number[];
  months: number[];
  daysOfWeek: number[];
}

const RANGES: Array<[keyof CronFields, number, number]> = [
  ["minutes", 0, 59],
  ["hours", 0, 23],
  ["daysOfMonth", 1, 31],
  ["months", 1, 12],
  ["daysOfWeek", 0, 6],
];

/** Returns null when valid, or a human-readable problem. */
export function validateCron(expression: string): string | null {
  try {
    parseCron(expression);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "Invalid cron expression";
  }
}

export function parseCron(expression: string): CronFields {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    return fail("A cron expression needs 5 fields: minute hour day month weekday");
  }

  const fields = {} as CronFields;

  RANGES.forEach(([name, min, max], index) => {
    fields[name] = parseField(parts[index], min, max, name);
  });

  return fields;
}

function parseField(part: string, min: number, max: number, name: string): number[] {
  const values = new Set<number>();

  for (const segment of part.split(",")) {
    const [range, stepText] = segment.split("/");
    const step = stepText === undefined ? 1 : Number.parseInt(stepText, 10);

    if (!Number.isInteger(step) || step < 1) {
      return fail(`Invalid step "${stepText}" in the ${name} field`);
    }

    let start: number;
    let end: number;

    if (range === "*") {
      start = min;
      end = max;
    } else if (range.includes("-")) {
      const [a, b] = range.split("-").map((n) => Number.parseInt(n, 10));
      start = a;
      end = b;
    } else {
      start = Number.parseInt(range, 10);
      // A bare value with a step means "from here onwards", e.g. 5/10.
      end = stepText === undefined ? start : max;
    }

    if (!Number.isInteger(start) || !Number.isInteger(end)) {
      return fail(`Invalid value "${segment}" in the ${name} field`);
    }
    if (start < min || end > max || start > end) {
      return fail(`The ${name} field must be between ${min} and ${max}`);
    }

    for (let value = start; value <= end; value += step) values.add(value);
  }

  if (!values.size) return fail(`The ${name} field matched nothing`);
  return [...values].sort((a, b) => a - b);
}

function fail(message: string): never {
  throw new Error(message);
}

/**
 * Next UTC occurrence strictly after `from`. Steps minute by minute, capped
 * at four years so an impossible expression (31 February) terminates rather
 * than looping forever.
 */
export function nextCronRun(expression: string, from: Date = new Date()): Date {
  const fields = parseCron(expression);

  const cursor = new Date(from.getTime());
  cursor.setUTCSeconds(0, 0);
  cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);

  const limit = 366 * 4 * 24 * 60;

  for (let i = 0; i < limit; i++) {
    if (matches(cursor, fields)) return cursor;
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }

  throw new Error("That cron expression has no next occurrence within four years");
}

function matches(date: Date, fields: CronFields): boolean {
  if (!fields.minutes.includes(date.getUTCMinutes())) return false;
  if (!fields.hours.includes(date.getUTCHours())) return false;
  if (!fields.months.includes(date.getUTCMonth() + 1)) return false;

  const domRestricted = fields.daysOfMonth.length !== 31;
  const dowRestricted = fields.daysOfWeek.length !== 7;
  const domMatch = fields.daysOfMonth.includes(date.getUTCDate());
  const dowMatch = fields.daysOfWeek.includes(date.getUTCDay());

  // Standard cron quirk: when both day fields are restricted they are OR-ed,
  // not AND-ed. `0 0 1 * 1` means "the 1st, and also every Monday".
  if (domRestricted && dowRestricted) return domMatch || dowMatch;
  if (domRestricted) return domMatch;
  if (dowRestricted) return dowMatch;
  return true;
}

/** Plain-English summary for the workflow list. */
export function describeCron(expression: string): string {
  try {
    const fields = parseCron(expression);
    const everyMinute = fields.minutes.length === 60;
    const everyHour = fields.hours.length === 24;

    if (everyMinute && everyHour) return "Every minute";
    if (everyHour && fields.minutes.length === 1) return `Hourly at :${pad(fields.minutes[0])}`;
    if (fields.hours.length === 1 && fields.minutes.length === 1) {
      const time = `${pad(fields.hours[0])}:${pad(fields.minutes[0])} UTC`;
      if (fields.daysOfWeek.length === 7 && fields.daysOfMonth.length === 31) return `Daily at ${time}`;
      if (fields.daysOfWeek.length < 7) {
        const names = fields.daysOfWeek.map((d) => DAY_NAMES[d]).join(", ");
        return `${names} at ${time}`;
      }
      return `Day ${fields.daysOfMonth.join(", ")} at ${time}`;
    }
    return `Cron: ${expression}`;
  } catch {
    return `Cron: ${expression}`;
  }
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
