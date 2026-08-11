# TaskPilot API — container image
#
# Built from the REPO ROOT as context, because the service depends on the
# workspace packages @taskpilot/shared and @taskpilot/browser-tools:
#   docker build -f services/api/Dockerfile .
#
# Railway: leave Root Directory at the repo root. Pointing it at services/api
# makes the workspace packages unreachable and the install fails.

# Node 24 (LTS). The hard floor is Node 22.13 — pnpm 11 imports node:sqlite,
# which does not exist on Node 20. That mismatch is what broke the first deploy.
FROM node:24-alpine AS base

# Corepack activates the exact pnpm pinned in the root packageManager field, so
# CI uses the same version as local dev instead of whatever is newest.
RUN corepack enable

WORKDIR /app

# ── Dependencies ──
# Every workspace manifest is copied before installing. --frozen-lockfile
# validates the lockfile against ALL projects in pnpm-workspace.yaml, so
# omitting even an unrelated package.json (apps/web) fails the install with
# ERR_PNPM_OUTDATED_LOCKFILE. Sources are copied later so that editing code
# does not invalidate this layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json ./apps/web/
COPY apps/extension/package.json ./apps/extension/
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/browser-tools/package.json ./packages/browser-tools/
COPY packages/sdk/package.json ./packages/sdk/
COPY packages/shared/package.json ./packages/shared/
COPY examples/package.json ./examples/
COPY services/api/package.json ./services/api/

# `@taskpilot/api...` resolves the API plus the workspace packages it depends
# on, so apps/web's dependency tree is never downloaded.
RUN pnpm install --frozen-lockfile --filter @taskpilot/api...

# ── Source ──
COPY packages ./packages
COPY services/api ./services/api

ENV NODE_ENV=production

# Documentation only: Railway injects PORT and the server reads it.
EXPOSE 4000

CMD ["pnpm", "--filter", "@taskpilot/api", "start"]
