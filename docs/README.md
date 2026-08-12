# TaskPilot Documentation

> **The AI Agent for Your Browser.** Natural language in, real browser actions out.

Every document here names the modules it describes, so the docs and the tree can
be checked against each other rather than drifting apart.

## Architecture

Read in order for a full picture; each stands alone for reference.

| Doc | Covers |
|---|---|
| [00_OVERVIEW](architecture/00_OVERVIEW.md) | The system in one page |
| [01_PRODUCT_VISION](architecture/01_PRODUCT_VISION.md) | What TaskPilot is for, and the five products |
| [02_ENGINEERING_PRINCIPLES](architecture/02_ENGINEERING_PRINCIPLES.md) | The rules the code actually follows |
| [03_SYSTEM_ARCHITECTURE](architecture/03_SYSTEM_ARCHITECTURE.md) | Layers, service map, module ownership |
| [04_DOMAIN_MODEL](architecture/04_DOMAIN_MODEL.md) | Entities and their relationships |
| [05_DATA_FLOW](architecture/05_DATA_FLOW.md) | How a request becomes an action |
| [06_EXECUTION_PIPELINE](architecture/06_EXECUTION_PIPELINE.md) | Plan → step → execute → record |
| [07_EVENT_ARCHITECTURE](architecture/07_EVENT_ARCHITECTURE.md) | Jobs, cron, notifications |
| [08_SECURITY_MODEL](architecture/08_SECURITY_MODEL.md) | Trust boundaries, RLS, secrets, CORS |
| [09_DEPLOYMENT](architecture/09_DEPLOYMENT.md) | Hosts, environments, build-time constraints |
| [10_PERFORMANCE](architecture/10_PERFORMANCE.md) | Caching, token budgeting, limits |

## Domains

One folder per bounded context, each pointing at the code that owns it.

| Domain | Owns |
|---|---|
| [ai](domains/ai/) | Planning, reasoning, providers |
| [browser](domains/browser/) | DOM, actions, extraction |
| [workflows](domains/workflows/) | Saved automations and scheduling |
| [memory](domains/memory/) | Run context and recall |
| [marketplace](domains/marketplace/) | Publishing, purchase, install |
| [analytics](domains/analytics/) | Usage and productivity metrics |
| [billing](domains/billing/) | Plans, quotas, Stripe |
| [auth](domains/auth/) | Identity, sessions, API keys, teams |
| [extension](domains/extension/) | The in-browser client |

## Reference

| Section | Contents |
|---|---|
| [api/](api/) | REST reference for `/v1` |
| [database/](database/) | Schema, migrations, row-level security |
| [adr/](adr/) | Architecture decision records |
| [diagrams/](diagrams/) | Source files for the diagrams used above |
| [prompts/](prompts/) | System prompts and prompt-design notes |
| [guides/](guides/) | Task-oriented setup guides |

## Elsewhere in the repo

- [RUNNING.md](../RUNNING.md) — run the stack locally, credentials, database
- [README.md](../README.md) — what the repo contains and how to start
- [`packages/sdk/README.md`](../packages/sdk/README.md) — developer SDK
