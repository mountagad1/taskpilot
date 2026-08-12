# Architecture Decision Records

Short notes on decisions that were not obvious, written so the next person does
not have to re-derive the reasoning — or undo it by accident.

## When to write one

Write an ADR when a choice constrains future work: a boundary, a dependency, a
data model that is hard to migrate, or a rejected alternative someone will
reasonably propose again.

Do not write one for a decision the code already states plainly.

## Format

```markdown
# NNN · Title

**Status** Accepted | Superseded by [NNN] | Rejected
**Date** YYYY-MM-DD

## Context
What was true that forced a decision.

## Decision
What we chose, stated plainly.

## Consequences
What this makes easy, what it makes hard, and what we accept as a cost.
```

Number sequentially. Never edit an accepted record to reflect a new decision —
write a new one and mark the old superseded. The value is the trail.

## Index

| ADR | Decision | Status |
|---|---|---|
| [001](001-plan-server-execute-client.md) | Plan on the server, execute in the browser | Accepted |
| [002](002-database-backed-queue.md) | Database-backed queue instead of a broker | Accepted |

## Decisions recorded elsewhere

Some are documented where they are enforced rather than as ADRs:

- Public/private repository split — [09_DEPLOYMENT](../architecture/09_DEPLOYMENT.md#splitting-the-repository)
- Heuristics before models — [02_ENGINEERING_PRINCIPLES](../architecture/02_ENGINEERING_PRINCIPLES.md#2-heuristics-before-models)
- Marketplace ledger vs Stripe Connect — [domains/marketplace](../domains/marketplace/#transaction-model)
