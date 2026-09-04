# Token budgets per AI task

Every AI action the extension runs goes through `POST /v1/ai/process`. It used
to send **up to 8,000 characters** of page content and allow **1,500 output
tokens** for every task — a one-paragraph summary was given the same budget as
a full data extraction.

Each task now carries its own budget, defined once in
`runtime/optimizer/token-optimizer.ts` (`AI_TASK_BUDGETS`).

| Task | Input chars | Output tokens | Content cleaned first |
|---|---|---|---|
| `summarize` | 6,000 | 400 | yes |
| `extract_data` | 8,000 | 900 | yes |
| `generate_reply` | 4,000 | 600 | yes |
| `custom` | 6,000 | 800 | yes |
| `translate` | 8,000 | scales with input | **no** |
| `rewrite` | 8,000 | scales with input | **no** |

Unknown task names fall back to the `custom` budget.

## Why two kinds of task

`verbatim` tasks — `translate` and `rewrite` — reproduce the user's content
rather than reasoning about it, so they get two exemptions:

- **No boilerplate stripping.** Deleting "Privacy Policy" from a page we are
  summarising is a saving. Deleting it from the user's translation is data
  loss.
- **An output ceiling derived from the input** (`chars / 4 × 1.4`, floored at
  256 and capped at 2,000). A translation is about as long as its source and
  some languages run longer; the old flat 1,500 could truncate a long one
  mid-sentence. Since `max_tokens` is a ceiling and not a charge, raising it
  costs nothing when the answer is short.

Everything else digests content into a shorter answer, so it gets boilerplate
stripped, whitespace collapsed, and then truncated — in that order, so the
character budget is spent on content rather than on cookie banners.

## What actually gets saved

Two different things, worth separating:

- **Input is a deterministic saving.** `generate_reply` sends half the
  characters it used to, `summarize` and `custom` three quarters — before
  boilerplate stripping, which removes a variable slice of most real pages on
  top of that.
- **Output is a ceiling, not a charge.** Capping `summarize` at 400 tokens
  only saves money when the model would have written more than that. It
  usually would: given 1,500 tokens, models fill them.

Output tokens cost 4–5× input on every model we route to, so the ceilings are
where most of the money is.

## Changing a budget

Edit `AI_TASK_BUDGETS` — it is the single source of truth, and
`token-budget.test.ts` enforces the invariants that keep a change honest: no
task may exceed the old 8,000-character input cap, digesting tasks stay under
the old 1,500-token output ceiling, and a verbatim task must always have room
to emit at least as many tokens as its input.

## Related

- [headroom-compression](headroom-compression.md) — optional proxy that
  compresses whatever is left after these budgets are applied.
- The semantic cache (`runtime/cache/semantic-cache.ts`) serves repeat
  page/task pairs without a model call at all. Because content is normalised
  before the cache key is derived, two visits to the same page that differ
  only in whitespace or a cookie banner now hit the same entry.
