# TaskPilot API — container image
#
# Built from the REPO ROOT as context (the service depends on workspace
# packages that live outside services/api):
#   docker build -f services/api/Dockerfile .
#
# The server reads PORT from the environment, which is what Railway/Render/Fly
# inject; it falls back to 4000 locally.

FROM node:22-alpine

RUN corepack enable

WORKDIR /app

# Manifests first so the install layer caches independently of source edits.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY services/api/package.json ./services/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/browser-tools/package.json ./packages/browser-tools/

# `@taskpilot/api...` pulls in the workspace packages it depends on.
RUN pnpm install --frozen-lockfile --filter @taskpilot/api...

COPY packages ./packages
COPY services/api ./services/api

ENV NODE_ENV=production
EXPOSE 4000

CMD ["pnpm", "--filter", "@taskpilot/api", "start"]
