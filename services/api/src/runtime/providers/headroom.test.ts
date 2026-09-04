import { describe, it, expect, vi } from 'vitest'
import { HeadroomCompressor, headroomFromEnv, withHeadroom } from './headroom'
import { ProviderRouter } from './index'
import type { LLMMessage, LLMProvider, LLMRequest } from './types'

/** A prompt comfortably over the default 2k-token floor. */
function bigMessages(): LLMMessage[] {
  return [
    { role: 'system', content: 'You are a planner.' },
    { role: 'user', content: 'x'.repeat(40_000) },
  ]
}

/** Builds a fetch stub that answers /v1/compress with `body`. */
function proxy(body: unknown, init: { status?: number } = {}) {
  return vi.fn(async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status: init.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    })
  ) as unknown as typeof fetch
}

const COMPRESSED = {
  messages: [
    { role: 'system', content: 'You are a planner.' },
    { role: 'user', content: 'short' },
  ],
  tokens_before: 10_001,
  tokens_after: 400,
  tokens_saved: 9_601,
  compression_ratio: 0.04,
  transforms_applied: ['smart_crusher'],
}

/** Records what the provider was actually asked to send. */
function recordingProvider(): LLMProvider & { seen: LLMRequest[] } {
  const seen: LLMRequest[] = []
  return {
    seen,
    name: 'recorder',
    supports: () => true,
    async complete(request) {
      seen.push(request)
      return {
        content: 'ok',
        model: request.model,
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, estimated_cost_usd: 0 },
      }
    },
  }
}

describe('HeadroomCompressor', () => {
  it('sends the proxy-compressed messages on to the model', async () => {
    const fetchImpl = proxy(COMPRESSED)
    const compressor = new HeadroomCompressor({ baseUrl: 'http://headroom:8787', fetchImpl })

    const { messages, outcome } = await compressor.compress(bigMessages(), 'gpt-4.1-mini')

    expect(messages.map((m) => m.content)).toEqual(['You are a planner.', 'short'])
    expect(outcome.compressed).toBe(true)
    expect(outcome.tokens_saved).toBe(9_601)
    expect(outcome.transforms).toEqual(['smart_crusher'])

    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('http://headroom:8787/v1/compress')
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      model: 'gpt-4.1-mini',
      messages: [{ role: 'system' }, { role: 'user' }],
    })
  })

  it('strips a trailing slash so the path is not doubled', async () => {
    const fetchImpl = proxy(COMPRESSED)
    const compressor = new HeadroomCompressor({ baseUrl: 'http://headroom:8787/', fetchImpl })

    await compressor.compress(bigMessages(), 'gpt-4.1-mini')

    const [url] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('http://headroom:8787/v1/compress')
  })

  it('sends an Authorization header only when a key is configured', async () => {
    const withKey = proxy(COMPRESSED)
    await new HeadroomCompressor({ fetchImpl: withKey, apiKey: 'hr_test' }).compress(
      bigMessages(),
      'gpt-4.1-mini'
    )
    const keyed = (withKey as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit
    expect((keyed.headers as Record<string, string>).Authorization).toBe('Bearer hr_test')

    const withoutKey = proxy(COMPRESSED)
    await new HeadroomCompressor({ fetchImpl: withoutKey }).compress(bigMessages(), 'gpt-4.1-mini')
    const anon = (withoutKey as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit
    expect((anon.headers as Record<string, string>).Authorization).toBeUndefined()
  })

  it('skips the round trip for prompts below the floor', async () => {
    const fetchImpl = proxy(COMPRESSED)
    const compressor = new HeadroomCompressor({ fetchImpl })

    const short: LLMMessage[] = [{ role: 'user', content: 'summarize this page' }]
    const { messages, outcome } = await compressor.compress(short, 'gpt-4.1-mini')

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(messages).toEqual(short)
    expect(outcome.compressed).toBe(false)
    expect(outcome.skipped_reason).toBe('below_min_tokens')
  })

  // Fail-open is the whole safety story: every one of these must return the
  // original prompt rather than throw.
  it.each([
    ['a 500 from the proxy', () => proxy({ error: 'boom' }, { status: 500 }), 'http_500'],
    ['a body that is not JSON', () => proxy('<html>502</html>'), 'invalid_json'],
    ['a 200 in an unknown shape', () => proxy({ result: 'surprise' }), 'unexpected_response'],
    [
      'a message with a role we do not send',
      () => proxy({ ...COMPRESSED, messages: [{ role: 'tool', content: 'x' }] }),
      'unexpected_response',
    ],
    [
      'a message whose content is not a string',
      () => proxy({ ...COMPRESSED, messages: [{ role: 'user', content: [{ type: 'text' }] }] }),
      'unexpected_response',
    ],
    ['an empty message list', () => proxy({ ...COMPRESSED, messages: [] }), 'unexpected_response'],
  ])('falls back to the original prompt on %s', async (_label, makeFetch, reason) => {
    const original = bigMessages()
    const compressor = new HeadroomCompressor({ fetchImpl: makeFetch() })

    const { messages, outcome } = await compressor.compress(original, 'gpt-4.1-mini')

    expect(messages).toEqual(original)
    expect(outcome.compressed).toBe(false)
    expect(outcome.skipped_reason).toBe(reason)
    expect(outcome.tokens_saved).toBe(0)
  })

  it('falls back when the proxy is unreachable', async () => {
    const original = bigMessages()
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed')
    }) as unknown as typeof fetch

    const { messages, outcome } = await new HeadroomCompressor({ fetchImpl }).compress(
      original,
      'gpt-4.1-mini'
    )

    expect(messages).toEqual(original)
    expect(outcome.skipped_reason).toBe('network_error:TypeError')
  })

  it('reports the timeout distinctly so slow proxies are visible in metrics', async () => {
    const fetchImpl = vi.fn(async () => {
      const err = new Error('The operation timed out.')
      err.name = 'TimeoutError'
      throw err
    }) as unknown as typeof fetch

    const { outcome } = await new HeadroomCompressor({ fetchImpl }).compress(
      bigMessages(),
      'gpt-4.1-mini'
    )

    expect(outcome.skipped_reason).toBe('timeout')
  })

  it("aborts compression with the caller's signal so a cancelled run does not wait", async () => {
    const controller = new AbortController()
    const fetchImpl = vi.fn(async (_url: unknown, init: RequestInit) => {
      // Mirror fetch: reject when the signal it was handed aborts.
      return await new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          const err = new Error('aborted')
          err.name = 'AbortError'
          reject(err)
        })
      })
    }) as unknown as typeof fetch

    const original = bigMessages()
    const pending = new HeadroomCompressor({ fetchImpl }).compress(
      original,
      'gpt-4.1-mini',
      controller.signal
    )
    controller.abort()

    const { messages, outcome } = await pending
    expect(messages).toEqual(original)
    expect(outcome.skipped_reason).toBe('network_error:AbortError')
  })

  it('does not let a throwing metrics sink break the call', async () => {
    const compressor = new HeadroomCompressor({
      fetchImpl: proxy(COMPRESSED),
      onResult: () => {
        throw new Error('metrics backend down')
      },
    })

    await expect(compressor.compress(bigMessages(), 'gpt-4.1-mini')).resolves.toMatchObject({
      outcome: { compressed: true },
    })
  })
})

describe('withHeadroom', () => {
  it('hands the provider the compressed prompt and reports the saving', async () => {
    const provider = recordingProvider()
    const wrapped = withHeadroom(
      provider,
      new HeadroomCompressor({ fetchImpl: proxy(COMPRESSED) })
    )

    const response = await wrapped.complete({ model: 'gpt-4.1-mini', messages: bigMessages() })

    expect(provider.seen[0].messages.map((m) => m.content)).toEqual([
      'You are a planner.',
      'short',
    ])
    expect(response.compression?.tokens_saved).toBe(9_601)
  })

  it('preserves the request fields the provider needs', async () => {
    const provider = recordingProvider()
    const wrapped = withHeadroom(
      provider,
      new HeadroomCompressor({ fetchImpl: proxy(COMPRESSED) })
    )

    await wrapped.complete({
      model: 'gpt-4.1-mini',
      messages: bigMessages(),
      json: true,
      temperature: 0,
      max_tokens: 1600,
    })

    expect(provider.seen[0]).toMatchObject({ json: true, temperature: 0, max_tokens: 1600 })
  })

  it('keeps the wrapped provider name and routing', () => {
    const provider = recordingProvider()
    const wrapped = withHeadroom(provider, new HeadroomCompressor())
    expect(wrapped.name).toBe('recorder')
    expect(wrapped.supports('gpt-4.1-mini')).toBe(true)
  })
})

describe('headroomFromEnv', () => {
  it('stays off when no proxy is configured', () => {
    expect(headroomFromEnv({})).toBeNull()
    expect(headroomFromEnv({ HEADROOM_BASE_URL: '   ' })).toBeNull()
  })

  it('turns on once a base URL is set', () => {
    expect(headroomFromEnv({ HEADROOM_BASE_URL: 'http://headroom:8787' })).toBeInstanceOf(
      HeadroomCompressor
    )
  })

  it('ignores unparseable numeric overrides rather than disabling itself', () => {
    const compressor = headroomFromEnv({
      HEADROOM_BASE_URL: 'http://headroom:8787',
      HEADROOM_TIMEOUT_MS: 'soon',
      HEADROOM_MIN_TOKENS: '-1',
    })
    expect(compressor).toBeInstanceOf(HeadroomCompressor)
  })
})

describe('ProviderRouter with compression', () => {
  it('routes provider calls through the compressor when one is supplied', async () => {
    const provider = recordingProvider()
    const router = new ProviderRouter({
      override: provider,
      compressor: new HeadroomCompressor({ fetchImpl: proxy(COMPRESSED) }),
    })

    const response = await router.complete({ model: 'gpt-4.1-mini', messages: bigMessages() })

    expect(provider.seen[0].messages[1].content).toBe('short')
    expect(response.compression?.compressed).toBe(true)
  })

  it('sends prompts untouched when no compressor is configured', async () => {
    const provider = recordingProvider()
    const router = new ProviderRouter({ override: provider })

    const original = bigMessages()
    const response = await router.complete({ model: 'gpt-4.1-mini', messages: original })

    expect(provider.seen[0].messages).toEqual(original)
    expect(response.compression).toBeUndefined()
  })
})
