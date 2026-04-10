import { Redis } from '@upstash/redis';

let redis = null;

function getRedis() {
  if (!redis) {
    const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
      return null; // No Redis configured — fall through to direct API calls
    }
    redis = new Redis({ url, token });
  }
  return redis;
}

const DEFAULT_TTL = 900; // 15 minutes in seconds

/**
 * Get cached data or fetch fresh.
 * If Redis is not configured, always calls fetchFn directly.
 *
 * @param {string} key - Cache key
 * @param {Function} fetchFn - Async function to fetch fresh data
 * @param {number} ttlSeconds - Cache TTL in seconds (default 900)
 * @returns {Promise<any>} - Cached or fresh data
 */
export async function getCached(key, fetchFn, ttlSeconds = DEFAULT_TTL) {
  const r = getRedis();

  if (r) {
    try {
      const cached = await r.get(key);
      if (cached) {
        return cached;
      }
    } catch (err) {
      console.warn(`Cache read error for ${key}:`, err.message);
    }
  }

  // Cache miss or no Redis — fetch fresh
  const fresh = await fetchFn();

  if (r) {
    try {
      await r.set(key, fresh, { ex: ttlSeconds });
    } catch (err) {
      console.warn(`Cache write error for ${key}:`, err.message);
    }
  }

  return fresh;
}

/**
 * Get a value directly from Redis (for bracket state, etc.)
 */
export async function kvGet(key) {
  const r = getRedis();
  if (!r) return null;
  try {
    return await r.get(key);
  } catch (err) {
    console.warn(`KV get error for ${key}:`, err.message);
    return null;
  }
}

/**
 * Set a value directly in Redis (for bracket state, etc.)
 * No TTL — persists until explicitly updated.
 */
export async function kvSet(key, value) {
  const r = getRedis();
  if (!r) throw new Error('Redis not configured');
  await r.set(key, value);
}

/**
 * Invalidate all cached API data (games and teams).
 */
export async function invalidateCache() {
  const r = getRedis();
  if (!r) return;

  const keys = [
    'games:1', 'games:2', 'games:3',
    'games:1:1', 'games:1:2', 'games:2:1', 'games:2:2', 'games:3:1', 'games:3:2',
    'teams:1', 'teams:2', 'teams:3',
    'standings:1', 'standings:2', 'standings:3',
    'game-scores',
  ];

  for (const key of keys) {
    try {
      await r.del(key);
    } catch (err) {
      console.warn(`Cache invalidate error for ${key}:`, err.message);
    }
  }
}
