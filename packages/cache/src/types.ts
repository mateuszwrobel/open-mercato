// The cache contract types live in shared so `@open-mercato/shared` can type
// against them without depending on this package (see architecture.spec.toml).
// Type-only re-export — no runtime edge is created.
import type { CacheValue } from '@open-mercato/shared/lib/cache/types'

export type {
  CacheValue,
  CacheOptions,
  CacheGetOptions,
  CacheSetOptions,
  CacheStrategy,
} from '@open-mercato/shared/lib/cache/types'

export type CacheEntry = {
  key: string
  value: CacheValue
  tags: string[]
  expiresAt: number | null
  /**
   * Wall-clock creation time. Informational/diagnostic only — LRU recency and
   * eviction rely purely on Map insertion order, not on this field.
   */
  createdAt: number
}

export type CacheServiceOptions = {
  strategy?: 'memory' | 'redis' | 'sqlite' | 'jsonfile'
  redisUrl?: string
  sqlitePath?: string
  jsonFilePath?: string
  defaultTtl?: number
  /**
   * Upper bound on retained entries for the in-memory strategy (including the
   * memory fallback used when a native dependency is unavailable). Bounds
   * memory for process-wide instances via LRU eviction. Falls back to
   * `CACHE_MEMORY_MAX_ENTRIES` then a built-in default; a non-positive value
   * disables the cap.
   */
  maxEntries?: number
  /**
   * Value compression for the redis and sqlite strategies. Falls back to
   * `CACHE_COMPRESSION`, then `off`. Reads detect the stored format, so
   * entries written under any setting stay readable.
   */
  compression?: 'off' | 'zstd' | 'gzip'
  /**
   * Smallest serialized entry, in bytes, that gets compressed. Falls back to
   * `CACHE_COMPRESSION_MIN_BYTES`, then 1024.
   */
  compressionMinBytes?: number
}
