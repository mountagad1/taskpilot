# 00 · Overview

TaskPilot turns natural language into real browser actions. A user describes a
task; the system plans it server-side and executes it in the user's own browser.

## The one-paragraph version

The extension captures a compact description of the current page and sends it,
with the user's instruction, to the API. The API authenticates the caller,
checks their plan, and asks the runtime for a plan — heuristics first, a model
only when heuristics cannot resolve the task. The resulting steps go back to the
extension, which executes them against the live DOM. Results are recorded, and
can be exported or replayed later as a saved agent.

## Why it is split this way

**Planning is server-side** so prompts, model keys and billing logic never reach
a page that arbitrary JavaScript can read.

**Execution is client-side** so the user's existing logged-in sessions are
reused. Nothing is replayed on a server that would need their credentials.

That single split explains most of the structure: `services/api` holds every
secret, `apps/extension` holds every DOM capability, and `@taskpilot/shared`
carries the vocabulary between them.

## Shape of the system

```text
  apps/web            apps/extension
  Next.js UI          Manifest V3 client
        │                    │
        └────────┬───────────┘
                 │ HTTPS
                 ▼
          services/api  (Hono, /v1)
                 │
     ┌───────────┼───────────┐
     ▼           ▼           ▼
  runtime/    lib/        db/
  planning    domain      PostgreSQL
              logic       + RLS
```

## Where to go next

- The products and their purpose — [01_PRODUCT_VISION](01_PRODUCT_VISION.md)
- The rules the code follows — [02_ENGINEERING_PRINCIPLES](02_ENGINEERING_PRINCIPLES.md)
- Module-by-module map — [03_SYSTEM_ARCHITECTURE](03_SYSTEM_ARCHITECTURE.md)
