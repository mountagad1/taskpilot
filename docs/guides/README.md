# Guides

Task-oriented walkthroughs. For how the system is built, see
[architecture/](../architecture/); this folder is for getting something done.

| Guide | Covers |
|---|---|
| [hubspot-setup](hubspot-setup.md) | Registering the HubSpot app and wiring OAuth |
| [TaskPilot-Technical-UpdatedDocumentation.pdf](TaskPilot-Technical-UpdatedDocumentation.pdf) | **Current** — architecture 00–10 as a single document |
| [TaskPilot-Technical-Documentation.pdf](TaskPilot-Technical-Documentation.pdf) | Superseded — predates the backend split |

## Regenerating the PDF

The current PDF is **generated from `docs/architecture/`**, never hand-edited,
so it cannot drift from the markdown:

```bash
pip install reportlab
python3 scripts/build-docs-pdf.py \
  docs/architecture \
  docs/guides/TaskPilot-Technical-UpdatedDocumentation.pdf \
  2.0
```

Rebuild it whenever an architecture document changes, and bump the version
argument when the change is material.

## Elsewhere

| Task | Where |
|---|---|
| Run the stack locally | [RUNNING.md](../../RUNNING.md) |
| Credentials and env vars | [RUNNING.md](../../RUNNING.md), [09_DEPLOYMENT](../architecture/09_DEPLOYMENT.md#environment-variables) |
| Build and load the extension | [RUNNING.md](../../RUNNING.md) |
| Split into two repositories | [RUNNING.md](../../RUNNING.md#splitting-into-two-repositories) |
| Call the REST API | [api/](../api/) |
| Build an agent with the SDK | [`packages/sdk/README.md`](../../packages/sdk/README.md) |

> The PDF predates the backend split and is kept for reference only. Where it
> disagrees with [architecture/](../architecture/), the architecture docs are
> current.
