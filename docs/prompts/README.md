# Prompts

System prompts and the reasoning behind them.

**Implemented in** `services/api/src/runtime/` — `planner/`, `reasoner/`,
`providers/`

## Design rules

**A prompt is code.** It is reviewed, versioned and tested like anything else
that decides program behaviour. Changing one can alter every plan the system
produces.

**Page content is data, never instruction.** Text extracted from a page is
untrusted input. A page that contains "ignore previous instructions" is a page
containing that string — not a command. This is the single most important
property to preserve when editing planner prompts.

**Budget before you write.** Every capability has a token allowance
(`runtime/optimizer/token-optimizer.ts`). A prompt that does not fit its budget
is a bug, not a tuning problem.

**Prefer not to ask.** If a heuristic can resolve the task, no prompt runs at
all. The cheapest prompt is the one that never executes
([02_ENGINEERING_PRINCIPLES](../architecture/02_ENGINEERING_PRINCIPLES.md#2-heuristics-before-models)).

## Provider differences

Prompts are authored against the interface in `runtime/providers/types.ts`, not
a specific vendor. Anthropic, OpenAI and mock implementations sit behind it.

Where a model genuinely needs different phrasing, that belongs in its provider
module — not in a branch inside a shared prompt.

## Testing

The mock provider (`runtime/providers/mock.ts`) makes planning deterministic in
tests, so prompt changes surface as diffs in planned steps rather than as
flaky runs.

## User-authored prompts

Distinct from system prompts: users save their own in `saved_prompts`. Those are
content, not program behaviour, and carry no special trust.
