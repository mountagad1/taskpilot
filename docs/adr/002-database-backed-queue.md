# 002 · Database-backed queue instead of a message broker

**Status** Accepted
**Date** 2026-08-12 (recorded retrospectively)

## Context

Scheduled workflows and deferred work need a queue. The obvious candidates were
a dedicated broker (SQS, Redis streams, a hosted queue) or a table in the
database we already run.

A broker is the textbook answer, but it adds a service to operate, a second
place for state to diverge from the rows it refers to, and a failure mode where
a job exists in the queue for a workflow that was deleted.

## Decision

Use a `job_queue` table, drained by `POST /v1/jobs/worker`
(`lib/worker.ts`). A local ticker (`worker-loop.mjs`) calls it in development;
any scheduler can call it in production.

The endpoint refuses to run without `WORKER_SECRET`.

## Consequences

**Easier.** Enqueueing is transactional with the data it refers to — a workflow
and its next job commit together or not at all. One less service to run,
monitor and pay for. The trigger is observable: it either returned or it did
not.

**Harder.** Throughput is bounded by the database rather than a purpose-built
broker. This is fine at current volume and would need revisiting before
high-frequency scheduling.

**Accepted cost.** Something external must call the endpoint. That is a
deliberate trade: an in-process loop would mean several API instances racing on
the same jobs, and horizontal scaling is worth more than the convenience.

**Safe by default.** Because the endpoint requires `WORKER_SECRET`, a fresh
deployment does not start firing automations before anyone intends it to.
