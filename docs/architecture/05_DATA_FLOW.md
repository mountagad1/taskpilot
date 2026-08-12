# 05 · Data Flow

How an instruction becomes an action, and what crosses each boundary.

```text
  Natural language
        │
        ▼
  ① Extension captures page context
     DOM digest — not raw HTML
        │
        ▼  HTTPS
  ② API authenticates, checks plan limits, opens a run
        │
        ▼
  ③ Runtime plans — heuristics, then a model if needed
        │
        ▼  step list
  ④ Extension executes against the live DOM
        │
        ▼
  ⑤ Results recorded, exported, or returned
```

## What crosses the wire

**Extension → API.** The instruction, plus a *digest* of the page: candidate
elements and their roles, not the full document. Sending less is both a privacy
property and a token-cost property.

**API → Extension.** A list of steps to perform. No credentials, no prompts, no
model output beyond what the step needs.

The vocabulary for both directions lives in `@taskpilot/shared`, which is why
that package is the only one imported across the trust boundary.

## What never crosses

| Stays server-side | Stays client-side |
|---|---|
| Model API keys | The user's cookies and sessions |
| System prompts | Full page contents |
| Billing state | Local DOM handles |
| Service-role database access | — |

## Where data comes to rest

| Data | Destination |
|---|---|
| Run and step records | `agent_runs`, `agent_run_steps` |
| Model call metadata | `ai_requests` |
| Cached responses | `response_cache` |
| Files produced | `stored_files` |
| Usage counters | `usage_periods`, `analytics_events` |

## Failure behaviour

Each stage fails distinctly, so the user sees a cause rather than a generic
error:

| Stage | Failure | Result |
|---|---|---|
| ② | Not signed in | `401` |
| ② | Over plan limit | `429` with the limit named |
| ② | Subsystem unconfigured | `503 not_configured` |
| ③ | No model configured | Heuristic plan, or a clear message |
| ④ | Element not found | Step fails, run records why |

The distinction between "unreachable" and "rejected" is deliberate — see
[02_ENGINEERING_PRINCIPLES](02_ENGINEERING_PRINCIPLES.md#7-say-what-is-wrong-precisely).
