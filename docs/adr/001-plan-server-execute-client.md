# 001 · Plan on the server, execute in the browser

**Status** Accepted
**Date** 2026-08-12 (recorded retrospectively; the split predates this record)

## Context

TaskPilot performs actions on sites the user is already signed in to. Two
arrangements were possible.

Run everything server-side, in a headless browser. That requires holding or
replaying the user's credentials for every third-party site — a standing
liability, and a login flow that breaks on every MFA prompt.

Run everything client-side, in the extension. That puts prompts, model API keys
and billing logic inside a page context where any script on that page could
read them.

## Decision

Split along the trust boundary. **Planning happens server-side** in
`services/api`; **execution happens client-side** in `apps/extension`.

The two exchange a page digest and a step list, using vocabulary from
`@taskpilot/shared` — the only package imported across the boundary.

## Consequences

**Easier.** TaskPilot never holds third-party credentials; the user's existing
sessions and MFA state are reused as-is. Secrets stay in one package, which is
what makes the public/private repository split a move rather than a rewrite.

**Harder.** Execution cannot be trusted blindly — the client reports outcomes
and the server records them, but a compromised client can lie about results.
Anything security-relevant must be verified server-side.

**Accepted cost.** A round-trip per planning cycle. Mitigated by resolving most
tasks heuristically and caching equivalent plans, so the round-trip usually
avoids a model call rather than adding to one.

**Follows from this.** The page digest exists because the server needs page
context without receiving the whole document — both a token-cost and a privacy
property.
