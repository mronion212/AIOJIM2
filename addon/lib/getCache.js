const Redis = require('ioredis');
const packageJson = require('../../package.json');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const GLOBAL_NO_CACHE = process.env.NO_CACHE === 'true';
const ADDON_VERSION = packageJson.version;

// --- Time To Live (TTL) constants in seconds ---
const META_TTL = process.env.META_TTL ||  7 * 24 * 60 * 60;     // 7 days
const CATALOG_TTL = process.env.CATALOG_TTL ||  1 * 24 * 60 * 60;  // 1 day
const JIKAN_API_TTL = 7 * 24 * 60 * 60;   // 7 days for stable Jikan data
const STATIC_CATALOG_TTL = 30 * 24 * 60 * 60; // 30 days for historical catalogs
const TVDB_API_TTL = 12 * 60 * 60;   // 12 hours in seconds for API data

const redis = GLOBAL_NO_CACHE ? null : new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
});

if (redis) {
  redis.on('error', err => console.error('Redis Client Error:', err));
  redis.on('connect', () => console.log('Redis client connected.'));
}

const inFlightRequests = new Map();

/**
 * - Automatically versions keys with the addon version for cache busting on releases.
 * -  `bypassCache` flag for easy development and testing via a URL param.
 * - Prevents "cache stampede" by tracking in-flight requests.
 *
 * @param {string} key The unique, un-versioned cache key (e.g., 'meta:tt12345').
 * @param {Function} method The async function to execute on a cache miss.
 * @param {number} ttl The Time To Live for the cache entry in seconds.
 * @param {boolean} [bypassCache=false] If true, ignores the cache read for this one request.
 * @returns The result of the method, from cache or a fresh call.
 */
async function cacheWrap(key, method, ttl, bypassCache = false) {
  // If the global switch is on, or if Redis is unavailable, always fetch fresh data.
  if (GLOBAL_NO_CACHE || !redis) {
    return method();
  }

  // Prepend the addon version to the key to automatically invalidate old caches on update.
  const versionedKey = `v${ADDON_VERSION}:${key}`;

  if (!bypassCache) {
    try {
      const cached = await redis.get(versionedKey);
      if (cached) {
        try {
          // If found, parse and return the cached data.
          return JSON.parse(cached);
        } catch (err) {
          console.warn(`[Cache] Failed to parse cached JSON for key ${versionedKey}:`, err);
        }
      }
    } catch (err) {
      console.warn(`[Cache] Failed to read from Redis for key ${versionedKey}:`, err);
    }
  } else {
    console.log(`[Cache] BYPASS triggered for key: ${versionedKey}`);
  }

  if (inFlightRequests.has(versionedKey)) {
    return inFlightRequests.get(versionedKey);
  }

  const promise = method();
  inFlightRequests.set(versionedKey, promise);

  try {
    const result = await promise;

    if (result !== null && result !== undefined) {
      try {
        await redis.set(versionedKey, JSON.stringify(result), 'EX', ttl);
      } catch (err) {
        console.warn(`[Cache] Failed to write to Redis for key ${versionedKey}:`, err);
      }
    }
    return result;
  } catch (error) {
    console.error(`[Cache] Method failed for cache key ${versionedKey}:`, error);
    throw error; 
  } finally {
    inFlightRequests.delete(versionedKey);
  }
}


function cacheWrapCatalog(configString, catalogKey, method, bypassCache = false) {
  const key = `catalog:${configString}:${catalogKey}`;
  return cacheWrap(key, method, CATALOG_TTL, bypassCache);
}

function cacheWrapMeta(configString, metaId, method, bypassCache = false) {
   const key = `meta:${configString}:${metaId}`;
   return cacheWrap(key, method, META_TTL, bypassCache);
}

function cacheWrapJikanApi(key, method, bypassCache = false) {
  const subkey = key.replace(/\s/g, '-');
  return cacheWrap(`jikan-api:${subkey}`, method, JIKAN_API_TTL, bypassCache);
}

function cacheWrapStaticCatalog(configString, catalogKey, method, bypassCache = false) {
  const fullKey = `catalog:${configString}:${catalogKey}`;
  return cacheWrap(fullKey, method, STATIC_CATALOG_TTL, bypassCache);
}

function cacheWrapTvdbApi(key, method, bypassCache = false) {
  return cacheWrap(`tvdb-api:${key}`, method, TVDB_API_TTL, bypassCache);
}

module.exports = {
  redis,
  cacheWrapCatalog,
  cacheWrapMeta,
  cacheWrapJikanApi,
  cacheWrapStaticCatalog,
  cacheWrapTvdbApi,
  cacheWrap
};
