import { Redis } from '@upstash/redis'

interface CacheEntry {
  result: unknown
  task: string
  model: string
  tokensUsed: number
  createdAt: number
  hitCount: number
}

interface CacheStats {
  hits: number
  misses: number
  hitRate: number
  totalSaved: number // estimated tokens saved
}

export class SemanticCache {
  private redis: Redis
  private readonly DEFAULT_TTL = 3600 // 1 hour
  private readonly LONG_TTL = 86400 // 24 hours
  private readonly STATS_KEY = 'cache:stats'

  // Task types that benefit from longer caching
  private readonly LONG_CACHE_TASKS = new Set([
    'summarize',
    'translate',
    'extract_emails',
    'extract_prices',
    'extract_tables',
  ])

  constructor() {
    this.redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  }

  /**
   * Generate a deterministic cache key from request parameters.
   * The key intentionally ignores user identity — same content = same result.
   */
  generateKey(params: {
    task: string
    pageContent: string
    userInput?: string
    url?: string
    language?: string
  }): string {
    const { task, pageContent, userInput = '', url = '', language = 'en' } = params

    // Normalize content for cache key generation
    const normalizedContent = pageContent
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 2000) // Only use first 2000 chars for key

    const keySource = `${task}:${normalizedContent}:${userInput}:${url}:${language}`

    // Simple hash function
    let hash = 0
    for (let i = 0; i < keySource.length; i++) {
      const char = keySource.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32-bit integer
    }

    return `semantic:${task}:${Math.abs(hash).toString(36)}`
  }

  async get(key: string): Promise<unknown | null> {
    try {
      const raw = await this.redis.get<CacheEntry>(key)
      if (!raw) {
        await this.trackMiss()
        return null
      }

      // Update hit count
      await this.redis.hincrby(key, 'hitCount', 1)
      await this.trackHit(raw.tokensUsed || 0)

      return raw.result
    } catch (err) {
      console.error('[SemanticCache] get error:', err)
      return null
    }
  }

  async set(
    key: string,
    result: unknown,
    meta: { task: string; model: string; tokensUsed: number }
  ): Promise<void> {
    try {
      const entry: CacheEntry = {
        result,
        task: meta.task,
        model: meta.model,
        tokensUsed: meta.tokensUsed,
        createdAt: Date.now(),
        hitCount: 0,
      }

      const ttl = this.LONG_CACHE_TASKS.has(meta.task)
        ? this.LONG_TTL
        : this.DEFAULT_TTL

      await this.redis.setex(key, ttl, JSON.stringify(entry))
    } catch (err) {
      console.error('[SemanticCache] set error:', err)
    }
  }

  async invalidate(pattern: string): Promise<void> {
    try {
      // For Upstash, we use scan to find matching keys
      const keys = await this.redis.keys(`semantic:${pattern}:*`)
      if (keys.length > 0) {
        await this.redis.del(...keys)
      }
    } catch (err) {
      console.error('[SemanticCache] invalidate error:', err)
    }
  }

  async getStats(): Promise<CacheStats> {
    try {
      const stats = await this.redis.hgetall<Record<string, string>>(
        this.STATS_KEY
      )
      const hits = parseInt(stats?.hits || '0')
      const misses = parseInt(stats?.misses || '0')
      const totalSaved = parseInt(stats?.tokensSaved || '0')
      const total = hits + misses

      return {
        hits,
        misses,
        hitRate: total > 0 ? hits / total : 0,
        totalSaved,
      }
    } catch {
      return { hits: 0, misses: 0, hitRate: 0, totalSaved: 0 }
    }
  }

  private async trackHit(tokensSaved: number): Promise<void> {
    try {
      await this.redis.hincrby(this.STATS_KEY, 'hits', 1)
      if (tokensSaved > 0) {
        await this.redis.hincrby(this.STATS_KEY, 'tokensSaved', tokensSaved)
      }
    } catch {
      // Non-critical
    }
  }

  private async trackMiss(): Promise<void> {
    try {
      await this.redis.hincrby(this.STATS_KEY, 'misses', 1)
    } catch {
      // Non-critical
    }
  }

  /**
   * Warm cache with common summarize/translate queries after a page analysis.
   * Called proactively on first visit to a popular page.
   */
  async warmCache(
    pageContent: string,
    url: string,
    precomputedResults: Array<{ task: string; result: unknown; tokensUsed: number }>
  ): Promise<void> {
    const promises = precomputedResults.map(({ task, result, tokensUsed }) => {
      const key = this.generateKey({ task, pageContent, url })
      return this.set(key, result, { task, model: 'gpt-4.1-mini', tokensUsed })
    })
    await Promise.allSettled(promises)
  }
}

export const semanticCache = new SemanticCache()
