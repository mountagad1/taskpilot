// ============================================================
// TASKPILOT — PAGE EXTRACTION
// packages/browser-tools/src/extract/index.ts
//
// Everything here runs without an AI call. Whatever these functions can
// answer is answered for free, which is what keeps the median request
// off the model entirely.
// ============================================================

import type { PageContext, PageType, TableData } from "@taskpilot/shared";
import { isVisible } from "../dom/resolver";
import { detectFormFields } from "../smart-paste";

// ─── VISIBLE TEXT ────────────────────────────────────────────

/** Elements that carry no reading value and only inflate the token count. */
const BOILERPLATE = "script, style, noscript, template, svg, iframe, nav, footer, aside, [aria-hidden='true']";

export function getVisibleText(doc: Document = document, maxChars = 20_000): string {
  const body = doc.body;
  if (!body) return "";

  // Clone so removing boilerplate never mutates the page the user is on.
  const clone = body.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(BOILERPLATE).forEach((el) => el.remove());

  return clone.textContent?.replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim().slice(0, maxChars) ?? "";
}

export function getSelectedText(doc: Document = document): string {
  const selection = doc.defaultView?.getSelection?.();
  return selection?.toString().trim() ?? "";
}

// ─── EMAILS / PRICES / LINKS ─────────────────────────────────

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

export function extractEmails(text: string): string[] {
  const matches = text.match(EMAIL_RE) ?? [];
  // Case-insensitive dedupe: Foo@x.com and foo@x.com are one address.
  const seen = new Map<string, string>();
  for (const raw of matches) {
    const key = raw.toLowerCase();
    if (!seen.has(key)) seen.set(key, raw);
  }
  return [...seen.values()];
}

export interface ExtractedPrice {
  raw: string;
  amount: number;
  currency: string;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  $: "USD",
  "€": "EUR",
  "£": "GBP",
  "¥": "JPY",
  "₹": "INR",
  "₩": "KRW",
  "₽": "RUB",
};

const PRICE_RE =
  /([$€£¥₹₩₽])\s?(\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{1,2})?)|(\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{1,2})?)\s?(USD|EUR|GBP|JPY|INR|CAD|AUD|CHF|SEK|NOK|DKK|PLN)\b/gi;

export function extractPrices(text: string): ExtractedPrice[] {
  const results: ExtractedPrice[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(PRICE_RE)) {
    const [raw, symbol, symbolAmount, codeAmount, code] = match;
    const currency = symbol ? CURRENCY_SYMBOLS[symbol] ?? "USD" : code!.toUpperCase();
    const amountText = symbol ? symbolAmount : codeAmount;
    const amount = parseAmount(amountText!);
    if (amount === null) continue;

    const key = `${currency}:${amount}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ raw: raw.trim(), amount, currency });
  }

  return results;
}

/**
 * Handles both `1,234.56` and `1.234,56`. The last separator followed by
 * exactly two digits is the decimal point; anything else is a thousands mark.
 */
function parseAmount(text: string): number | null {
  const cleaned = text.replace(/\s/g, "");
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  let normalised: string;
  if (lastComma > lastDot) {
    normalised = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    normalised = cleaned.replace(/,/g, "");
  } else {
    normalised = cleaned.replace(/[.,]/g, "");
  }

  const value = Number.parseFloat(normalised);
  return Number.isFinite(value) ? value : null;
}

export interface ExtractedLink {
  href: string;
  text: string;
  /** True when the link leaves the current origin. */
  external: boolean;
}

export function extractLinks(doc: Document = document, limit = 500): ExtractedLink[] {
  const origin = doc.location?.origin ?? "";
  const seen = new Set<string>();
  const links: ExtractedLink[] = [];

  for (const anchor of doc.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    if (links.length >= limit) break;
    const href = anchor.href || anchor.getAttribute("href") || "";
    if (!href || href.startsWith("javascript:") || href.startsWith("#")) continue;
    if (seen.has(href)) continue;
    seen.add(href);

    links.push({
      href,
      text: (anchor.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 200),
      external: Boolean(origin) && !href.startsWith(origin),
    });
  }

  return links;
}

// ─── TABLES ──────────────────────────────────────────────────

export function extractTables(doc: Document = document, maxRows = 500): TableData[] {
  const tables: TableData[] = [];

  doc.querySelectorAll<HTMLTableElement>("table").forEach((table, tableIndex) => {
    if (!isVisible(table)) return;

    const rows = [...table.querySelectorAll("tr")];
    if (rows.length < 2) return; // a single row isn't tabular data

    // Header row: an explicit <th> row if present, otherwise the first row.
    const headerRow = rows.find((row) => row.querySelector("th")) ?? rows[0];
    const headers = [...headerRow.querySelectorAll("th, td")].map((cell, i) =>
      cellText(cell) || `column_${i + 1}`
    );

    const bodyRows = rows
      .filter((row) => row !== headerRow)
      .slice(0, maxRows)
      .map((row) => [...row.querySelectorAll("td, th")].map(cellText))
      // A row of all-empty cells is a spacer, not data.
      .filter((cells) => cells.some((c) => c.length > 0));

    if (!bodyRows.length) return;

    tables.push({
      headers,
      rows: bodyRows,
      row_count: bodyRows.length,
      element_selector: table.id ? `#${table.id}` : `table:nth-of-type(${tableIndex + 1})`,
    });
  });

  return tables;
}

/** Rows keyed by header — the shape exports and integrations actually want. */
export function tableToRecords(table: TableData): Array<Record<string, string>> {
  return table.rows.map((row) => {
    const record: Record<string, string> = {};
    table.headers.forEach((header, i) => {
      record[header] = row[i] ?? "";
    });
    return record;
  });
}

function cellText(cell: Element): string {
  return (cell.textContent ?? "").replace(/\s+/g, " ").trim();
}

// ─── PAGE CLASSIFICATION ─────────────────────────────────────

const PAGE_TYPE_HINTS: Array<{ type: PageType; hosts: RegExp; paths?: RegExp }> = [
  { type: "crm", hosts: /(hubspot|salesforce|pipedrive|zoho|close|attio)\./i },
  { type: "email", hosts: /(mail\.google|outlook\.(office|live)|mail\.yahoo|superhuman|hey)\./i },
  { type: "social", hosts: /(linkedin|twitter|x\.com|facebook|instagram|reddit|threads)\./i },
  { type: "ecommerce", hosts: /(amazon|ebay|etsy|shopify|aliexpress|walmart)\./i },
  { type: "documentation", hosts: /(docs?\.|developer\.|readthedocs|gitbook)/i },
];

export function detectPageType(doc: Document = document): PageType {
  const host = doc.location?.hostname ?? "";
  const path = doc.location?.pathname ?? "";

  for (const hint of PAGE_TYPE_HINTS) {
    if (hint.hosts.test(host) && (!hint.paths || hint.paths.test(path))) return hint.type;
  }

  // Structural signals, in order of how strongly they imply a page's purpose.
  if (doc.querySelector("article, [itemtype*='Article'], .post-content")) return "article";
  if (doc.querySelectorAll("form input, form textarea").length >= 3) return "form";
  if (doc.querySelectorAll("table").length >= 2) return "dashboard";

  return "generic";
}

// ─── PAGE CONTEXT ────────────────────────────────────────────

/** Assembles the snapshot the planner and runtime reason over. */
export function buildPageContext(doc: Document = document, maxChars = 20_000): PageContext {
  const metaDescription =
    doc.querySelector<HTMLMetaElement>("meta[name='description']")?.content ??
    doc.querySelector<HTMLMetaElement>("meta[property='og:description']")?.content ??
    undefined;

  const selected = getSelectedText(doc);

  return {
    url: doc.location?.href ?? "",
    title: doc.title ?? "",
    visible_text: getVisibleText(doc, maxChars),
    meta_description: metaDescription,
    ...(selected ? { selected_text: selected } : {}),
    detected_forms: detectFormFields(doc),
    detected_tables: extractTables(doc),
    page_type: detectPageType(doc),
    domain: doc.location?.hostname ?? "",
  };
}
