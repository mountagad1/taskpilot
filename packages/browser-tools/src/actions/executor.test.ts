// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ActionExecutor, type HostBridge } from './executor'

function setBody(html: string) {
  document.body.innerHTML = html
}

function exec(host: HostBridge = {}) {
  // Short timeout keeps "not found" assertions fast.
  return new ActionExecutor({ doc: document, host, defaultTimeoutMs: 50 })
}

beforeEach(() => {
  document.body.innerHTML = ''
})

// ─── CLICK ───────────────────────────────────────────────────

describe('click', () => {
  it('clicks a button found by its visible text', async () => {
    setBody('<button id="go">Save changes</button>')
    const clicked = vi.fn()
    document.getElementById('go')!.addEventListener('click', clicked)

    const result = await exec().execute({
      type: 'click',
      target: { by: 'text', value: 'Save changes' },
    })

    expect(result.success).toBe(true)
    expect(clicked).toHaveBeenCalled()
  })

  it('falls back to the next strategy when the primary misses', async () => {
    setBody('<button data-testid="submit-btn">Go</button>')

    const result = await exec().execute({
      type: 'click',
      target: {
        by: 'css',
        value: '#does-not-exist',
        fallbacks: [{ by: 'testid', value: 'submit-btn' }],
      },
    })

    expect(result.success).toBe(true)
  })

  it('reports a retryable failure when the target is absent', async () => {
    setBody('<div>nothing here</div>')

    const result = await exec().execute({ type: 'click', target: { by: 'css', value: '#ghost' } })

    expect(result.success).toBe(false)
    expect(result.retryable).toBe(true)
    expect(result.error).toMatch(/could not find/i)
  })

  it('distinguishes "present but hidden" from "not found"', async () => {
    setBody('<button id="go" style="display:none">Save</button>')

    const result = await exec().execute({ type: 'click', target: { by: 'css', value: '#go' } })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not visible/i)
  })

  it('refuses to click a disabled control', async () => {
    setBody('<button id="go" disabled>Save</button>')

    const result = await exec().execute({ type: 'click', target: { by: 'css', value: '#go' } })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/disabled/i)
  })

  it('picks the innermost element for an ambiguous text match', async () => {
    setBody('<div id="outer"><span id="inner">Click me</span></div>')
    const outerClicks = vi.fn()
    const innerClicks = vi.fn()
    document.getElementById('outer')!.addEventListener('click', outerClicks)
    document.getElementById('inner')!.addEventListener('click', innerClicks)

    await exec().execute({ type: 'click', target: { by: 'text', value: 'Click me' } })

    expect(innerClicks).toHaveBeenCalled()
  })
})

// ─── TYPE / FORMS ────────────────────────────────────────────

describe('type', () => {
  it('types into an input found by its label', async () => {
    setBody('<label for="email">Email address</label><input id="email" type="email">')

    const result = await exec().execute({
      type: 'type',
      target: { by: 'label', value: 'email address' },
      params: { text: 'ada@example.com' },
    })

    expect(result.success).toBe(true)
    expect((document.getElementById('email') as HTMLInputElement).value).toBe('ada@example.com')
  })

  it('fires input and change events so frameworks observe the write', async () => {
    setBody('<input id="name">')
    const seen: string[] = []
    const el = document.getElementById('name')!
    el.addEventListener('input', () => seen.push('input'))
    el.addEventListener('change', () => seen.push('change'))

    await exec().execute({ type: 'type', target: { by: 'css', value: '#name' }, params: { text: 'Ada' } })

    expect(seen).toContain('input')
    expect(seen).toContain('change')
  })

  it('replaces the existing value by default and appends when asked not to clear', async () => {
    setBody('<input id="f" value="old">')

    await exec().execute({ type: 'type', target: { by: 'css', value: '#f' }, params: { text: 'new' } })
    expect((document.getElementById('f') as HTMLInputElement).value).toBe('new')

    await exec().execute({
      type: 'type',
      target: { by: 'css', value: '#f' },
      params: { text: '-more', clear_first: false },
    })
    expect((document.getElementById('f') as HTMLInputElement).value).toBe('new-more')
  })

  it('writes into a contenteditable element', async () => {
    setBody('<div id="editor" contenteditable="true"></div>')

    const result = await exec().execute({
      type: 'type',
      target: { by: 'css', value: '#editor' },
      params: { text: 'hello' },
    })

    expect(result.success).toBe(true)
    expect(document.getElementById('editor')!.textContent).toBe('hello')
  })

  it('fails when the target cannot hold text', async () => {
    setBody('<div id="plain">not editable</div>')

    const result = await exec().execute({
      type: 'type',
      target: { by: 'css', value: '#plain' },
      params: { text: 'x' },
    })

    expect(result.success).toBe(false)
    expect(result.retryable).toBe(false)
  })
})

describe('select_option and check', () => {
  it('selects by visible label as well as by value', async () => {
    setBody('<select id="c"><option value="us">United States</option><option value="fr">France</option></select>')

    await exec().execute({
      type: 'select_option',
      target: { by: 'css', value: '#c' },
      params: { value: 'France' },
    })

    expect((document.getElementById('c') as HTMLSelectElement).value).toBe('fr')
  })

  it('lists the available options when nothing matches', async () => {
    setBody('<select id="c"><option value="us">United States</option></select>')

    const result = await exec().execute({
      type: 'select_option',
      target: { by: 'css', value: '#c' },
      params: { value: 'Atlantis' },
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('United States')
  })

  it('toggles a checkbox and honours an explicit desired state', async () => {
    setBody('<input type="checkbox" id="t">')
    const box = document.getElementById('t') as HTMLInputElement

    await exec().execute({ type: 'check', target: { by: 'css', value: '#t' } })
    expect(box.checked).toBe(true)

    await exec().execute({ type: 'check', target: { by: 'css', value: '#t' }, params: { checked: true } })
    expect(box.checked).toBe(true)
  })

  it('refuses a non-checkbox target', async () => {
    setBody('<input type="text" id="t">')
    const result = await exec().execute({ type: 'check', target: { by: 'css', value: '#t' } })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not a checkbox/i)
  })
})

describe('fill_form', () => {
  it('fills fields matched by name, id or label and reports misses', async () => {
    setBody(`
      <form>
        <label for="fn">First name</label><input id="fn" name="first_name">
        <input name="company" placeholder="Company">
      </form>
    `)

    const result = await exec().execute({
      type: 'fill_form',
      params: { values: { first_name: 'Ada', company: 'Analytical Engines', nonexistent: 'x' } },
    })

    expect(result.success).toBe(true)
    const data = result.data as { filled: string[]; missed: string[] }
    expect(data.filled).toEqual(expect.arrayContaining(['first_name', 'company']))
    expect(data.missed).toContain('nonexistent')
    expect((document.getElementById('fn') as HTMLInputElement).value).toBe('Ada')
  })

  it('fails when none of the requested fields exist', async () => {
    setBody('<form><input name="other"></form>')
    const result = await exec().execute({ type: 'fill_form', params: { values: { nope: '1' } } })
    expect(result.success).toBe(false)
  })
})

// ─── EXTRACTION ──────────────────────────────────────────────

describe('extraction actions', () => {
  it('extracts and dedupes emails case-insensitively', async () => {
    setBody('<p>Ada@example.com and ada@example.com and bob@test.org</p>')

    const result = await exec().execute({ type: 'extract_emails' })

    expect(result.success).toBe(true)
    expect(result.data).toEqual(['Ada@example.com', 'bob@test.org'])
  })

  it('extracts prices with currency and parses both decimal conventions', async () => {
    setBody('<p>$1,234.56 and €1.234,56 and 99 USD</p>')

    const result = await exec().execute({ type: 'extract_prices' })
    const prices = result.data as Array<{ amount: number; currency: string }>

    expect(prices).toEqual(
      expect.arrayContaining([
        { raw: '$1,234.56', amount: 1234.56, currency: 'USD' },
        { raw: '€1.234,56', amount: 1234.56, currency: 'EUR' },
      ])
    )
  })

  it('extracts links, flags external ones and skips javascript: hrefs', async () => {
    setBody(`
      <a href="https://example.com/a">Internal</a>
      <a href="https://other.test/b">External</a>
      <a href="javascript:alert(1)">Bad</a>
      <a href="#frag">Fragment</a>
    `)

    const result = await exec().execute({ type: 'extract_links' })
    const links = result.data as Array<{ href: string; external: boolean }>

    expect(links.map((l) => l.href)).not.toContain('javascript:alert(1)')
    expect(links.some((l) => l.href.includes('other.test'))).toBe(true)
  })

  it('turns a table into header-keyed records', async () => {
    setBody(`
      <table>
        <tr><th>Name</th><th>Email</th></tr>
        <tr><td>Ada</td><td>ada@x.test</td></tr>
        <tr><td>Bob</td><td>bob@x.test</td></tr>
      </table>
    `)

    const result = await exec().execute({ type: 'extract_table' })
    const data = result.data as { headers: string[]; rows: Array<Record<string, string>>; row_count: number }

    expect(data.headers).toEqual(['Name', 'Email'])
    expect(data.row_count).toBe(2)
    expect(data.rows[0]).toEqual({ Name: 'Ada', Email: 'ada@x.test' })
  })

  it('fails clearly when the page has no table', async () => {
    setBody('<p>no tables</p>')
    const result = await exec().execute({ type: 'extract_table' })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/no tables/i)
  })

  it('excludes script and style content from the captured text', async () => {
    setBody('<script>var secret = 1</script><style>.a{color:red}</style><p>Visible copy</p>')

    const result = await exec().execute({ type: 'read_page' })
    const context = result.data as { visible_text: string }

    expect(context.visible_text).toContain('Visible copy')
    expect(context.visible_text).not.toContain('secret')
    expect(context.visible_text).not.toContain('color:red')
  })
})

// ─── ASSERTIONS / WAITING ────────────────────────────────────

describe('assert_text and wait', () => {
  it('passes when the text is present and fails when it is not', async () => {
    setBody('<p>Order confirmed</p>')

    expect((await exec().execute({ type: 'assert_text', params: { text: 'order CONFIRMED' } })).success).toBe(true)
    expect((await exec().execute({ type: 'assert_text', params: { text: 'refunded' } })).success).toBe(false)
  })

  it('caps a wait so an agent cannot burn the run budget sleeping', async () => {
    const executor = new ActionExecutor({ doc: document, maxWaitMs: 40 })

    const capped = await executor.execute({ type: 'wait', params: { ms: 999_999 } })
    expect((capped.data as { waited_ms: number }).waited_ms).toBe(40)

    const floored = await executor.execute({ type: 'wait', params: { ms: -100 } })
    expect((floored.data as { waited_ms: number }).waited_ms).toBe(0)
  })

  it('resolves wait_for_element once the node appears', async () => {
    setBody('<div id="host"></div>')
    setTimeout(() => {
      document.getElementById('host')!.innerHTML = '<span id="late">here</span>'
    }, 30)

    const executor = new ActionExecutor({ doc: document, defaultTimeoutMs: 50 })
    const result = await executor.execute({
      type: 'wait_for_element',
      target: { by: 'css', value: '#late' },
      params: { timeout_ms: 1000 },
    })

    expect(result.success).toBe(true)
  })
})

// ─── SECURITY ────────────────────────────────────────────────

describe('URL scheme enforcement', () => {
  it.each([
    ['javascript:alert(1)'],
    ['data:text/html,<script>alert(1)</script>'],
    ['file:///etc/passwd'],
  ])('refuses to navigate to %s', async (url) => {
    const result = await exec().execute({ type: 'navigate', params: { url } })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/scheme|unparseable|needs a url/i)
  })

  it('refuses the same schemes for download_file', async () => {
    const host: HostBridge = { downloadFile: vi.fn() }
    const result = await exec(host).execute({
      type: 'download_file',
      params: { url: 'javascript:fetch("//evil.test")' },
    })

    expect(result.success).toBe(false)
    expect(host.downloadFile).not.toHaveBeenCalled()
  })
})

// ─── HOST-DELEGATED ACTIONS ──────────────────────────────────

describe('host-delegated actions', () => {
  it('fails cleanly when a privileged capability has no host bridge', async () => {
    for (const type of ['screenshot', 'open_tab', 'upload_file'] as const) {
      const result = await exec().execute({
        type,
        params: { url: 'https://example.com', file_id: 'f1' },
      })
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/not available/i)
    }
  })

  it('refuses to close a tab the run did not open', async () => {
    const host: HostBridge = { closeTab: vi.fn(), openTab: vi.fn().mockResolvedValue({ tab_id: 7 }) }
    const executor = exec(host)

    const result = await executor.execute({ type: 'close_tab', params: { tab_id: 99 } })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/only close tabs this run opened/i)
    expect(host.closeTab).not.toHaveBeenCalled()
  })

  it('closes a tab it opened itself', async () => {
    const host: HostBridge = {
      openTab: vi.fn().mockResolvedValue({ tab_id: 7 }),
      closeTab: vi.fn().mockResolvedValue(undefined),
    }
    const executor = exec(host)

    await executor.execute({ type: 'open_tab', params: { url: 'https://example.com' } })
    const result = await executor.execute({ type: 'close_tab', params: { tab_id: 7 } })

    expect(result.success).toBe(true)
    expect(host.closeTab).toHaveBeenCalledWith(7)
  })

  it('routes AI actions through the host bridge', async () => {
    setBody('<p>Some article body</p>')
    const runAI = vi.fn().mockResolvedValue({ summary: 'short' })

    const result = await exec({ runAI }).execute({ type: 'summarize', params: { length: 'short' } })

    expect(result.success).toBe(true)
    expect(runAI).toHaveBeenCalledWith(
      'summarize',
      expect.objectContaining({ length: 'short', content: expect.stringContaining('Some article body') })
    )
  })

  it('uploads a resolved file into a file input', async () => {
    setBody('<input type="file" id="up">')
    const file = new File(['contents'], 'report.pdf', { type: 'application/pdf' })
    const host: HostBridge = { resolveFile: vi.fn().mockResolvedValue(file) }

    const result = await exec(host).execute({
      type: 'upload_file',
      target: { by: 'css', value: '#up' },
      params: { file_id: 'stored-1' },
    })

    expect(result.success).toBe(true)
    expect((document.getElementById('up') as HTMLInputElement).files?.[0]?.name).toBe('report.pdf')
  })
})

// ─── EXPORT ──────────────────────────────────────────────────

describe('export_data', () => {
  it('serialises rows to CSV locally when no export service is attached', async () => {
    const result = await exec().execute({
      type: 'export_data',
      params: { rows: [{ name: 'Ada', email: 'ada@x.test' }], format: 'csv', filename: 'people' },
    })

    expect(result.success).toBe(true)
    const data = result.data as { filename: string; content: string; row_count: number }
    expect(data.filename).toBe('people.csv')
    expect(data.content).toContain('name,email')
    expect(data.content).toContain('Ada,ada@x.test')
    expect(data.row_count).toBe(1)
  })

  it('routes binary formats to the export service and fails without one', async () => {
    const saveExport = vi.fn().mockResolvedValue({ filename: 'x.xlsx' })

    const ok = await exec({ saveExport }).execute({
      type: 'export_data',
      params: { rows: [{ a: 1 }], format: 'excel' },
    })
    expect(ok.success).toBe(true)
    expect(saveExport).toHaveBeenCalled()

    const missing = await exec().execute({
      type: 'export_data',
      params: { rows: [{ a: 1 }], format: 'excel' },
    })
    expect(missing.success).toBe(false)
    expect(missing.error).toMatch(/export service/i)
  })

  it('refuses to export nothing', async () => {
    const result = await exec().execute({ type: 'export_data', params: { rows: [], format: 'csv' } })
    expect(result.success).toBe(false)
  })
})

// ─── DISPATCHER ADAPTER ──────────────────────────────────────

describe('asDispatcher', () => {
  it('exposes dispatch and readContext for the runtime', async () => {
    setBody('<h1>Title</h1><p>Body text</p>')
    const dispatcher = exec().asDispatcher()

    const result = await dispatcher.dispatch({ type: 'extract_emails' })
    expect(result.success).toBe(true)

    const context = await dispatcher.readContext()
    expect(context.visible_text).toContain('Body text')
    expect(context.page_type).toBeTruthy()
  })
})
