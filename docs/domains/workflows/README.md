# Domain · Workflows

A workflow is a saved, repeatable automation — optionally on a schedule.

**Owns** `services/api/src/lib/workflows.ts`, `lib/cron.ts`

| Surface | Route |
|---|---|
| CRUD and runs | `/v1/workflows` (`routes/platform.ts`) |

## Data

| Table | Holds |
|---|---|
| `workflows` | Definition and schedule |
| `workflow_runs` | Execution history |
| `job_queue` | Pending scheduled work |

## Scheduling

`lib/cron.ts` parses a cron expression and computes the next run. It is
deliberately over-tested (28 cases) because schedule bugs are silent,
timezone-dependent, and usually noticed days late.

One test asserts it **throws** on an impossible expression (e.g. February 30th)
rather than looping forever searching for a date that never arrives.

## Execution

Scheduled work enters the same pipeline as an interactive run, from the queue
rather than a request — see
[07_EVENT_ARCHITECTURE](../../architecture/07_EVENT_ARCHITECTURE.md).

Scheduled runs stay disabled until `WORKER_SECRET` is set, so a fresh
deployment never starts firing automations unattended.

## Relationship to agents

An agent is a versioned manifest; a workflow is an agent plus *when* and *with
what inputs*. Saving a workflow is how a one-off task becomes reusable, and
publishing it is how it becomes a marketplace listing
([marketplace](../marketplace/)).

## Tests

`lib/cron.test.ts`

## See also

[06_EXECUTION_PIPELINE](../../architecture/06_EXECUTION_PIPELINE.md)
