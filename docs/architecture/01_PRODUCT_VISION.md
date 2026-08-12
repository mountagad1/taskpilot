# 01 · Product Vision

> **The AI Agent for Your Browser.**
>
> Turn natural language into real browser actions. Fill forms, extract data,
> generate replies, automate repetitive work, and export results — all from any
> website.

Beyond automating a single task, TaskPilot lets any workflow be packaged as an
agent: reusable, shareable with a team, or sold on a marketplace.

## The five products

| Product | What it does | Code |
|---|---|---|
| **Browser Extension** | Executes agents inside the page | `apps/extension` |
| **Web Application** | Users, agents, billing, analytics, history | `apps/web` |
| **AI Runtime** | Plans, reasons, orchestrates | `services/api/src/runtime` |
| **Marketplace** | Publish, discover, buy, sell agents | `services/api/src/lib/marketplace.ts` |
| **Developer Platform** | SDK, typed client, API keys | `packages/sdk`, `packages/api-client` |

## Capabilities

What a user can do today, and the domain that owns it:

| Capability | Domain |
|---|---|
| Control a website with natural language | [ai](../domains/ai/), [browser](../domains/browser/) |
| Fill forms automatically | [browser](../domains/browser/) |
| Extract structured data from pages | [browser](../domains/browser/) |
| Generate AI-powered replies | [ai](../domains/ai/) |
| Upload and download files | [browser](../domains/browser/) |
| Export results to CSV, Excel, JSON | [browser](../domains/browser/) |
| Save a workflow as a reusable agent | [workflows](../domains/workflows/) |
| Schedule recurring automations | [workflows](../domains/workflows/) |
| Share agents with a team | [auth](../domains/auth/) |
| Publish and sell agents | [marketplace](../domains/marketplace/) |
| Install community agents | [marketplace](../domains/marketplace/) |
| Build automations without code | [workflows](../domains/workflows/) |

## Long-term direction

TaskPilot aims to be the operating system for browser automation: every browser
task executable through natural language, every workflow packageable as an
agent, and every agent distributable — so developers can build businesses on
their agents and users can automate work without writing code.
