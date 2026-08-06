#!/usr/bin/env node
// ============================================================
// TASKPILOT — WORKER TICKER
// services/api/worker-loop.mjs
//
// Calls the worker endpoint on an interval. Useful in development and for
// any host without a managed cron. In production, point Vercel Cron (or an
// equivalent) at the same endpoint instead of running this process.
// ============================================================

import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Same .env handling as the server — this process needs WORKER_SECRET, and
// reads it from the same file rather than requiring a shell export.
const here = dirname(fileURLToPath(import.meta.url))
for (const name of ['.env.local', '.env']) {
  const file = resolve(here, name)
  if (existsSync(file)) {
    try {
      process.loadEnvFile(file)
    } catch (error) {
      console.warn(`[env] could not read ${file}: ${error.message}`)
    }
  }
}

const BASE_URL = process.env.TASKPILOT_API_URL ?? 'http://localhost:4000'
const SECRET = process.env.WORKER_SECRET
const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? 30_000)
const BATCH = Number(process.env.WORKER_BATCH ?? 10)

if (!SECRET) {
  console.error('WORKER_SECRET is not set. The worker endpoint refuses to run without it.')
  process.exit(1)
}

let running = true
let consecutiveFailures = 0

process.on('SIGINT', stop)
process.on('SIGTERM', stop)

function stop() {
  if (!running) return
  running = false
  console.log('\nStopping after the current tick...')
}

async function tick() {
  const started = Date.now()

  try {
    const response = await fetch(`${BASE_URL}/v1/jobs/worker?batch=${BATCH}`, {
      method: 'POST',
      headers: { 'X-Worker-Secret': SECRET },
    })

    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      const message = payload?.error?.message ?? `HTTP ${response.status}`
      throw new Error(message)
    }

    consecutiveFailures = 0
    const result = payload?.data ?? {}

    // Only log ticks that did something, so an idle queue stays quiet.
    if (result.claimed > 0 || result.requeued_stalled > 0) {
      console.log(
        `[${new Date().toISOString()}] claimed=${result.claimed} ok=${result.succeeded} ` +
          `failed=${result.failed} requeued=${result.requeued_stalled} (${Date.now() - started}ms)`
      )
      for (const detail of result.details ?? []) {
        if (!detail.ok) console.error(`  ${detail.type} ${detail.id}: ${detail.error}`)
      }
    }
  } catch (err) {
    consecutiveFailures++
    console.error(`[${new Date().toISOString()}] tick failed: ${err.message}`)

    // Back off when the server is down so the logs don't fill with noise.
    if (consecutiveFailures >= 3) {
      const backoff = Math.min(2 ** consecutiveFailures * 1000, 300_000)
      console.error(`  ${consecutiveFailures} failures in a row; waiting ${backoff / 1000}s`)
      await sleep(backoff)
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

console.log(`TaskPilot worker → ${BASE_URL} every ${INTERVAL_MS / 1000}s (batch ${BATCH})`)
console.log('Press Ctrl+C to stop.\n')

while (running) {
  await tick()
  if (!running) break
  await sleep(INTERVAL_MS)
}

console.log('Worker stopped.')
