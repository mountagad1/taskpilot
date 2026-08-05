/**
 * Fan an extraction agent across many URLs, with bounded concurrency.
 *
 *   TASKPILOT_API_KEY=tp_live_... npx tsx examples/bulk-extract.ts urls.txt
 *
 * Shows the pattern that matters for batch work: cap concurrency so the API
 * rate limit is never the thing that fails the job, and treat a per-URL
 * failure as data rather than an exception that aborts the batch.
 */

import { readFileSync } from 'node:fs'
import { TaskPilot, TaskPilotError } from '@taskpilot/sdk'
import type { PageContext } from '@taskpilot/shared'

const CONCURRENCY = Number(process.env.CONCURRENCY ?? 4)

interface Outcome {
  url: string
  ok: boolean
  rows?: number
  error?: string
}

async function extractOne(taskpilot: TaskPilot, url: string): Promise<Outcome> {
  const context: PageContext = {
    url,
    title: '',
    visible_text: '',
    detected_forms: [],
    detected_tables: [],
    page_type: 'generic',
    domain: safeHost(url),
  }

  try {
    const finished = await taskpilot.run(
      {
        goal: 'Extract the main data table and return it as rows',
        agentId: process.env.AGENT_ID,
        context,
      },
      { timeoutMs: 90_000 }
    )

    if (finished.status !== 'completed') {
      return { url, ok: false, error: finished.error ?? finished.status }
    }

    const result = finished.output.result
    return { url, ok: true, rows: Array.isArray(result) ? result.length : 1 }
  } catch (err) {
    // One bad URL must not take down the batch.
    const message = err instanceof TaskPilotError ? `${err.code}: ${err.message}` : String(err)
    return { url, ok: false, error: message }
  }
}

/** Simple worker pool — N workers pulling from one shared cursor. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor++
      if (index >= items.length) return
      results[index] = await worker(items[index], index)
    }
  })

  await Promise.all(runners)
  return results
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

async function main() {
  const file = process.argv[2]
  if (!file) {
    console.error('Usage: tsx examples/bulk-extract.ts <file-with-one-url-per-line>')
    process.exit(1)
  }

  const urls = readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))

  if (!urls.length) {
    console.error('No URLs found in that file.')
    process.exit(1)
  }

  console.log(`Extracting from ${urls.length} URLs, ${CONCURRENCY} at a time...\n`)

  const taskpilot = new TaskPilot()
  const started = Date.now()

  const outcomes = await mapWithConcurrency(urls, CONCURRENCY, async (url, i) => {
    const outcome = await extractOne(taskpilot, url)
    console.log(
      `[${i + 1}/${urls.length}] ${outcome.ok ? `ok — ${outcome.rows} rows` : `failed — ${outcome.error}`}  ${url}`
    )
    return outcome
  })

  const succeeded = outcomes.filter((o) => o.ok)
  const totalRows = succeeded.reduce((sum, o) => sum + (o.rows ?? 0), 0)

  console.log(`\nDone in ${Math.round((Date.now() - started) / 1000)}s`)
  console.log(`  succeeded: ${succeeded.length}/${outcomes.length}`)
  console.log(`  rows:      ${totalRows}`)

  const failures = outcomes.filter((o) => !o.ok)
  if (failures.length) {
    console.log('\nFailures:')
    for (const failure of failures) console.log(`  ${failure.url} — ${failure.error}`)
  }
}

void main()
