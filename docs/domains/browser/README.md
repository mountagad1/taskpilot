# Domain · Browser

Everything that touches a page. Holds no credentials and makes no network calls
of its own — it is given steps and reports outcomes.

**Owns** `packages/browser-tools/`

| Concern | Module |
|---|---|
| Finding elements | `src/dom/` |
| Performing actions | `src/actions/` |
| Reading data out | `src/extract/` |
| Writing files out | `src/export/` |
| Form autofill | `src/smart-paste.ts` |

## Element resolution

The hard part is not clicking — it is deciding *what* to click. The resolver
identifies candidates by role and accessible name rather than brittle CSS
paths, so a plan survives markup changes.

The same digest sent to the planner is built here: candidate elements and their
roles, not raw HTML. That keeps token cost down and page contents private
([05_DATA_FLOW](../../architecture/05_DATA_FLOW.md#what-crosses-the-wire)).

## Failure behaviour

A step that cannot resolve its target fails *that step* and records why. Runs
do not abort silently, and the reason is visible in `agent_run_steps`.

## Export

CSV, Excel and JSON. Served over HTTP by `/v1/exports` (`routes/misc.ts`),
which reuses this package rather than reimplementing formatting.

## Capabilities

Declared in `packages/shared` — `export_csv`, `export_excel`, `extract_*`,
`smart_paste` and friends. The catalogue is what a manifest is validated
against.

## Runs in

The extension (`apps/extension`), not the API. Execution is client-side so the
user's existing sessions are reused
([00_OVERVIEW](../../architecture/00_OVERVIEW.md#why-it-is-split-this-way)).

## See also

[extension](../extension/) · [06_EXECUTION_PIPELINE](../../architecture/06_EXECUTION_PIPELINE.md#execution)
