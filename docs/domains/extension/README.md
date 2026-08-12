# Domain · Extension

The in-browser client. Chrome, Edge, Brave and Arc — Manifest V3.

**Owns** `apps/extension/`

## Responsibilities

| Does | Does not |
|---|---|
| Capture page context as a digest | Hold API keys or model keys |
| Execute planned steps against the DOM | Decide *what* the steps are |
| Surface results and progress | Talk to the database |

Planning happens server-side; the extension is the hands, not the head
([00_OVERVIEW](../../architecture/00_OVERVIEW.md#why-it-is-split-this-way)).

## Why execution is client-side

The user is already signed in to the sites they want to automate. Running in
their browser reuses those sessions, so TaskPilot never needs to hold
third-party credentials or replay logins on a server.

## Capabilities

DOM work is delegated to `packages/browser-tools` rather than reimplemented
here — see [browser](../browser/).

## Talking to the API

Through `packages/api-client` over HTTPS. The API's CORS allowlist trusts
extension origins by *scheme* (`chrome-extension://`, `moz-extension://`),
because the per-install origin is unpredictable and the browser guarantees only
an installed extension can present it.

## Sign-in bridge

The web app hands the extension a session on sign-in
(`apps/web/src/lib/extension-bridge.ts`), so a user signs in once rather than
separately in both surfaces. `NEXT_PUBLIC_EXTENSION_ID` identifies the target.

## Building

See [RUNNING.md](../../../RUNNING.md). `TASKPILOT_API_ORIGIN` points a dev build
at a non-default API.

## See also

[browser](../browser/) · [08_SECURITY_MODEL](../../architecture/08_SECURITY_MODEL.md#trust-boundaries)
