# TaskPilot browser extension

**Do not load this folder in Chrome.** It holds TypeScript sources. Chrome
needs the compiled bundle in `dist/`, which the build creates.

Loading this folder gives:

> Could not load javascript 'content.js' for script. Could not load manifest.

## Build, then load `dist/`

From the repository root (Node ≥ 22.13):

```bash
corepack pnpm install
corepack pnpm --filter @taskpilot/extension build:dev   # local API on :4000, web on :3000
# or
corepack pnpm --filter @taskpilot/extension build       # production (https://taskpilot.cc/api)
```

The build fails if any file named in the manifest is missing, and it prints
the exact folder to load as its last lines.

Then in Chrome: `chrome://extensions` → **Developer mode** → **Load unpacked**
→ select **`apps/extension/dist`**.

To hand a build to someone who can't run it, use
`corepack pnpm --filter @taskpilot/extension package`. That writes
`apps/extension/taskpilot-extension-v<version>.zip`. They unzip it and load
the unzipped folder, which has `manifest.json` at its top level.

More detail: [RUNNING.md § 3](../../RUNNING.md#3-build-and-load-the-extension).
