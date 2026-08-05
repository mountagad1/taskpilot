// ============================================================
// TASKPILOT — ELEMENT RESOLVER
// packages/browser-tools/src/dom/resolver.ts
//
// Turning an ElementTarget into a live element. Real pages drift between
// the moment a plan is written and the moment it runs, so every strategy
// has fallbacks and visibility is always checked — clicking an element
// that exists but is hidden behind a modal is a silent wrong answer.
// ============================================================

import type { ElementTarget } from "@taskpilot/shared";

export interface ResolveOptions {
  root?: Document | Element;
  /** Reject matches the user could not have clicked. */
  requireVisible?: boolean;
  /** Poll until found or this many ms elapse. 0 resolves synchronously. */
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export interface ResolveResult {
  element: HTMLElement | null;
  /** Which strategy actually matched — surfaced in the run timeline. */
  strategy: string | null;
  /** How many elements matched before disambiguation. */
  candidates: number;
}

// ─── VISIBILITY ──────────────────────────────────────────────

/**
 * "Visible" here means "a user could interact with it". happy-dom has no
 * layout engine, so getBoundingClientRect is all zeros in tests; treat a
 * zero-sized box as visible and rely on the style/attribute signals, which
 * are what actually differ between a shown and hidden element.
 */
export function isVisible(element: HTMLElement): boolean {
  if (!element.isConnected) return false;
  if (element.hasAttribute("hidden")) return false;
  if (element.getAttribute("aria-hidden") === "true") return false;

  const view = element.ownerDocument?.defaultView;
  if (view?.getComputedStyle) {
    const style = view.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (style.opacity !== "" && Number.parseFloat(style.opacity) === 0) return false;
  }

  // An input of type=hidden is never interactable regardless of styles.
  if (element instanceof HTMLInputElement && element.type === "hidden") return false;

  return true;
}

export function isDisabled(element: HTMLElement): boolean {
  if (element.hasAttribute("disabled")) return true;
  if (element.getAttribute("aria-disabled") === "true") return true;
  return false;
}

// ─── TEXT ────────────────────────────────────────────────────

function normaliseText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Accessible-ish name: aria-label, then associated label, then own text. */
export function accessibleName(element: HTMLElement): string {
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) return normaliseText(ariaLabel);

  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const referenced = labelledBy
      .split(/\s+/)
      .map((id) => element.ownerDocument.getElementById(id)?.textContent ?? "")
      .join(" ");
    if (referenced.trim()) return normaliseText(referenced);
  }

  if (element.id) {
    const label = element.ownerDocument.querySelector(`label[for="${cssEscape(element.id)}"]`);
    if (label?.textContent) return normaliseText(label.textContent);
  }

  const wrappingLabel = element.closest("label");
  if (wrappingLabel?.textContent) return normaliseText(wrappingLabel.textContent);

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    if (element.placeholder) return normaliseText(element.placeholder);
    if (element.name) return normaliseText(element.name);
  }

  return normaliseText(element.textContent);
}

/** Minimal CSS.escape — the global isn't available in every runtime we target. */
export function cssEscape(value: string): string {
  return value.replace(/["\\\]\[#.:>+~*^$|()=]/g, "\\$&");
}

// ─── STRATEGIES ──────────────────────────────────────────────

type Strategy = ElementTarget["by"];

function collect(root: Document | Element, by: Strategy, value: string): HTMLElement[] {
  const all = (selector: string): HTMLElement[] => {
    try {
      return [...root.querySelectorAll<HTMLElement>(selector)];
    } catch {
      // An LLM-authored selector can be syntactically invalid; that's a miss,
      // not a crash.
      return [];
    }
  };

  const needle = normaliseText(value);

  switch (by) {
    case "css":
      return all(value);

    case "testid":
      return [
        ...all(`[data-testid="${cssEscape(value)}"]`),
        ...all(`[data-test-id="${cssEscape(value)}"]`),
        ...all(`[data-test="${cssEscape(value)}"]`),
      ];

    case "name":
      return all(`[name="${cssEscape(value)}"]`);

    case "placeholder":
      return all("input, textarea").filter((el) =>
        normaliseText((el as HTMLInputElement).placeholder).includes(needle)
      );

    case "role":
      return [...all(`[role="${cssEscape(value)}"]`), ...all(implicitRoleSelector(value))];

    case "label":
      return all("input, textarea, select, button, a, [role]").filter((el) =>
        accessibleName(el).includes(needle)
      );

    case "text": {
      const candidates = all("button, a, [role='button'], [role='link'], summary, label, td, th, li, span, p, h1, h2, h3, h4, div");
      const exact = candidates.filter((el) => normaliseText(el.textContent) === needle);
      if (exact.length) return preferInnermost(exact);
      const partial = candidates.filter((el) => normaliseText(el.textContent).includes(needle));
      return preferInnermost(partial);
    }

    default:
      return [];
  }
}

/**
 * A text match on a <div> usually also matches every ancestor. Keep only the
 * deepest matches so "click the row labelled X" doesn't click <body>.
 */
function preferInnermost(elements: HTMLElement[]): HTMLElement[] {
  return elements.filter((el) => !elements.some((other) => other !== el && el.contains(other)));
}

/** Maps a handful of ARIA roles onto the elements that imply them. */
function implicitRoleSelector(role: string): string {
  const map: Record<string, string> = {
    button: "button, input[type=button], input[type=submit], input[type=reset]",
    link: "a[href]",
    textbox: "input[type=text], input[type=email], input[type=search], input[type=url], input:not([type]), textarea",
    checkbox: "input[type=checkbox]",
    radio: "input[type=radio]",
    combobox: "select",
    heading: "h1, h2, h3, h4, h5, h6",
    list: "ul, ol",
    listitem: "li",
    table: "table",
    img: "img[alt]",
  };
  return map[role.toLowerCase()] ?? ":not(*)"; // matches nothing
}

// ─── RESOLUTION ──────────────────────────────────────────────

function attempt(
  target: ElementTarget,
  root: Document | Element,
  requireVisible: boolean
): ResolveResult {
  const strategies: Array<{ by: Strategy; value: string }> = [
    { by: target.by, value: target.value },
    ...(target.fallbacks ?? []),
  ];

  for (const strategy of strategies) {
    let matches = collect(root, strategy.by, strategy.value);
    if (requireVisible) matches = matches.filter(isVisible);
    if (!matches.length) continue;

    const index = target.index ?? 0;
    const element = matches[index] ?? null;
    if (element) {
      return { element, strategy: `${strategy.by}=${strategy.value}`, candidates: matches.length };
    }
  }

  return { element: null, strategy: null, candidates: 0 };
}

/**
 * Resolves a target, optionally waiting for it to appear. Waiting matters
 * for SPAs, where the plan's next step routinely runs before the framework
 * has committed the DOM the previous step triggered.
 */
export async function resolveElement(
  target: ElementTarget,
  options: ResolveOptions = {}
): Promise<ResolveResult> {
  const root = options.root ?? (typeof document !== "undefined" ? document : undefined);
  if (!root) return { element: null, strategy: null, candidates: 0 };

  const requireVisible = options.requireVisible ?? true;
  const timeoutMs = options.timeoutMs ?? 0;
  const pollIntervalMs = options.pollIntervalMs ?? 100;

  const immediate = attempt(target, root, requireVisible);
  if (immediate.element || timeoutMs <= 0) return immediate;

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    const result = attempt(target, root, requireVisible);
    if (result.element) return result;
  }

  // Last chance: the element may exist but be considered hidden. Report it
  // so the error can say "found but not visible" rather than "not found".
  if (requireVisible) {
    const hidden = attempt(target, root, false);
    if (hidden.element) {
      return { element: null, strategy: hidden.strategy, candidates: hidden.candidates };
    }
  }

  return { element: null, strategy: null, candidates: 0 };
}

/** Human-readable description of a target, for errors and confirmations. */
export function describeTarget(target: ElementTarget): string {
  if (target.description) return target.description;
  const base = `${target.by}="${target.value}"`;
  return target.index ? `${base} (#${target.index})` : base;
}
