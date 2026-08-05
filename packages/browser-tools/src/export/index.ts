// ============================================================
// TASKPILOT — EXPORT SERIALISERS
// packages/browser-tools/src/export/index.ts
//
// Pure string/byte producers with no DOM or Node dependency, so the same
// code backs the extension's client-side download, the /api/export route
// and the SDK.
// ============================================================

import type { ExportFormat, TableData } from "@taskpilot/shared";

export type ExportRow = Record<string, unknown>;

export interface SerialisedExport {
  filename: string;
  contentType: string;
  /** Text formats. Mutually exclusive with `bytes`. */
  content?: string;
  bytes?: Uint8Array;
}

// ─── NORMALISATION ───────────────────────────────────────────

/**
 * Coerces whatever a step produced into rows. Steps legitimately return
 * arrays of strings (emails), arrays of objects (contacts), a TableData, or
 * a single object — all of which a user reasonably expects to export.
 */
export function toRows(value: unknown): ExportRow[] {
  if (value == null) return [];

  if (isTableData(value)) {
    return value.rows.map((row) => {
      const record: ExportRow = {};
      value.headers.forEach((header, i) => {
        record[header] = row[i] ?? "";
      });
      return record;
    });
  }

  if (Array.isArray(value)) {
    if (!value.length) return [];
    // An array of scalars becomes a single-column sheet rather than a sheet
    // of "0,1,2" keys, which is what Object.entries would produce.
    if (value.every((item) => typeof item !== "object" || item === null)) {
      return value.map((item) => ({ value: item }));
    }
    return value.map((item) =>
      item && typeof item === "object" ? (item as ExportRow) : { value: item }
    );
  }

  if (typeof value === "object") return [value as ExportRow];

  return [{ value }];
}

function isTableData(value: unknown): value is TableData {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as TableData).headers) &&
    Array.isArray((value as TableData).rows)
  );
}

/** Union of every key present, so sparse rows don't lose columns. */
export function deriveHeaders(rows: ExportRow[]): string[] {
  const headers: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        headers.push(key);
      }
    }
  }
  return headers;
}

// ─── CSV ─────────────────────────────────────────────────────

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);

  // Leading =, +, - or @ makes Excel evaluate the cell as a formula. Prefix
  // with an apostrophe so exported page content can't execute in a spreadsheet.
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;

  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function toCSV(rows: ExportRow[], headers?: string[]): string {
  if (!rows.length) return "";
  const cols = headers?.length ? headers : deriveHeaders(rows);
  const lines = [
    cols.map(csvCell).join(","),
    ...rows.map((row) => cols.map((col) => csvCell(row[col])).join(",")),
  ];
  // BOM so Excel reads UTF-8 rather than the local codepage.
  return `﻿${lines.join("\r\n")}`;
}

// ─── JSON / MARKDOWN ─────────────────────────────────────────

export function toJSON(rows: ExportRow[]): string {
  return JSON.stringify(rows, null, 2);
}

export function toMarkdown(rows: ExportRow[], headers?: string[]): string {
  if (!rows.length) return "";
  const cols = headers?.length ? headers : deriveHeaders(rows);

  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    const text = typeof value === "object" ? JSON.stringify(value) : String(value);
    return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
  };

  return [
    `| ${cols.join(" | ")} |`,
    `| ${cols.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${cols.map((col) => escape(row[col])).join(" | ")} |`),
  ].join("\n");
}

// ─── DISPATCH ────────────────────────────────────────────────

const CONTENT_TYPES: Record<string, string> = {
  csv: "text/csv;charset=utf-8",
  json: "application/json",
  markdown: "text/markdown;charset=utf-8",
  excel: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

/**
 * Reduces an arbitrary label to a safe basename: no path separators, none of
 * the characters Windows rejects, no control bytes, and no leading or
 * trailing dots or dashes. Returns a default rather than an empty string,
 * since callers append an extension to whatever comes back.
 */
export function sanitiseFilename(name: string): string {
  // Allow-list rather than deny-list: enumerating unsafe characters invites
  // gaps, and is easy to get subtly wrong inside a character class.
  const cleaned = name
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[-.]+/, "")
    .slice(0, 120)
    .replace(/[-.]+$/, "");

  return cleaned || "taskpilot-export";
}

/**
 * Serialises rows to a text format. `excel` and `pdf` need a binary encoder
 * and are produced by the export service, not here — callers should route
 * those through `/api/export`.
 */
export function serialiseExport(
  format: Exclude<ExportFormat, "excel" | "pdf" | "word"> | "markdown",
  value: unknown,
  options: { filename?: string; headers?: string[] } = {}
): SerialisedExport {
  const rows = toRows(value);
  const base = sanitiseFilename(options.filename ?? "taskpilot-export");

  switch (format) {
    case "csv":
      return { filename: `${base}.csv`, contentType: CONTENT_TYPES.csv, content: toCSV(rows, options.headers) };
    case "json":
      return { filename: `${base}.json`, contentType: CONTENT_TYPES.json, content: toJSON(rows) };
    case "markdown":
      return {
        filename: `${base}.md`,
        contentType: CONTENT_TYPES.markdown,
        content: toMarkdown(rows, options.headers),
      };
    default: {
      const exhaustive: never = format;
      throw new Error(`Unsupported text export format: ${String(exhaustive)}`);
    }
  }
}

export function contentTypeFor(format: string): string {
  return CONTENT_TYPES[format] ?? "application/octet-stream";
}
