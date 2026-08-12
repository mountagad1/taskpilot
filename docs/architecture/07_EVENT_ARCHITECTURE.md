# 07 · Event Architecture

TaskPilot defers work through a database-backed queue rather than a message
broker. One less moving part, and the queue is transactional with the data it
refers to.

## Queue

| Piece | Where |
|---|---|
| Queue table | `job_queue` |
| Claim and run a batch | `lib/worker.ts` |
| Trigger endpoint | `POST /v1/jobs/worker` (`routes/misc.ts`) |
| Local ticker | `services/api/worker-loop.mjs` |

The endpoint is the unit of work: something calls it, it drains a batch. That
"something" can be the bundled ticker in development or any scheduler in
production.

### Concurrency

A batch is claimed with `FOR UPDATE SKIP LOCKED` (`db/migrations/006_platform.sql`),
so several workers can poll the same table at once without colliding or
double-running a job.

| Situation | Behaviour |
|---|---|
| Job fails | Retries on exponential backoff via `run_after` |
| Retries exhausted | Parked as `dead` — not retried forever |
| Worker crashes mid-job | Requeued after 15 minutes (`requeue_stalled_jobs`) |

Statuses are a Postgres enum: `queued`, `processing`, `succeeded`, `failed`,
`dead`. The stalled-job requeue is what makes a crashed worker recoverable
without manual intervention.

### Why an endpoint rather than an in-process loop

The API can scale horizontally without several instances racing on the same
jobs, and the trigger is observable — it either returned or it did not.

It refuses to run without `WORKER_SECRET`, so scheduled work stays off until
deliberately enabled rather than running unauthenticated.

## Scheduling

Cron expressions are parsed and advanced by `lib/cron.ts`, which computes the
next run time for a workflow.

That module is deliberately over-tested (28 cases) — schedule arithmetic fails
in ways that are silent, timezone-dependent, and only noticed days later. One
test asserts it *throws* on an impossible expression rather than looping
forever.

## Notifications

| Piece | Where |
|---|---|
| Emit | `notify_user` database function |
| Store | `notifications` |
| Preferences | `notification_preferences` |
| Read API | `/v1/notifications` (`routes/platform.ts`) |

Emitting from a database function means a notification is written in the same
transaction as the thing it describes — a run cannot complete without its
notification, or vice versa.

Callers include `lib/runs.ts` and `lib/agents.ts`.

## Analytics events

`analytics_events` and `productivity_metrics` record what happened for
reporting. They are written on the normal path and read by `/v1/analytics`;
nothing in the execution pipeline blocks on them.
