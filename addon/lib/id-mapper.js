const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const { redis } = require('./getCache'); 

// from  https://github.com/Fribb/anime-lists
const REMOTE_MAPPING_URL = 'https://raw.githubusercontent.com/Fribb/anime-lists/refs/heads/master/anime-list-full.json';
const LOCAL_CACHE_PATH = path.join(__dirname, '..', 'data', 'anime-list-full.json.cache');
const REDIS_ETAG_KEY = 'anime-list-etag'; 

let animeIdMap = new Map();
let isInitialized = false;

function processAndIndexData(jsonData) {
  const animeList = JSON.parse(jsonData);
  animeIdMap.clear();
  for (const item of animeList) {
    if (item.mal_id) {
      animeIdMap.set(item.mal_id, item);
    }
  }
  isInitialized = true;
  console.log(`[ID Mapper] Successfully loaded and indexed ${animeIdMap.size} anime mappings.`);
}

/**
 * Loads the anime mapping file into memory on addon startup.
 * It uses Redis and ETags to check if the remote file has changed,
 * avoiding a full download if the local cache is up-to-date.
 */
async function initializeMapper() {
  if (isInitialized) return;

  const useRedisCache = redis; 

  try {
    if (useRedisCache) {
      const savedEtag = await redis.get(REDIS_ETAG_KEY);
      const headers = (await axios.head(REMOTE_MAPPING_URL, { timeout: 10000 })).headers;
      const remoteEtag = headers.etag;

      console.log(`[ID Mapper] Saved ETag: ${savedEtag} | Remote ETag: ${remoteEtag}`);

      if (savedEtag && remoteEtag && savedEtag === remoteEtag) {
        try {
          console.log('[ID Mapper] No changes detected. Loading from local disk cache...');
          const fileContent = await fs.readFile(LOCAL_CACHE_PATH, 'utf-8');
          processAndIndexData(fileContent);
          return;
        } catch (e) {
          console.warn('[ID Mapper] ETag matched, but local cache was unreadable. Forcing re-download.');
        }
      }
    } else {
      console.log('[ID Mapper] Redis cache is disabled. Proceeding to download.');
    }

    console.log('[ID Mapper] Downloading full list...');
    const response = await axios.get(REMOTE_MAPPING_URL, { timeout: 45000 });
    const jsonData = JSON.stringify(response.data);

    
    await fs.mkdir(path.dirname(LOCAL_CACHE_PATH), { recursive: true });
    await fs.writeFile(LOCAL_CACHE_PATH, jsonData, 'utf-8');
    
    if (useRedisCache) {
      await redis.set(REDIS_ETAG_KEY, response.headers.etag);
    }
    
    processAndIndexData(jsonData);

  } catch (error) {
    console.error(`[ID Mapper] An error occurred during remote initialization: ${error.message}`);
    console.log('[ID Mapper] Attempting to fall back to local disk cache...');
    
    try {
      const fileContent = await fs.readFile(LOCAL_CACHE_PATH, 'utf-8');
      console.log('[ID Mapper] Successfully loaded data from local cache on fallback.');
      processAndIndexData(fileContent);
    } catch (fallbackError) {
      console.error('[ID Mapper] CRITICAL: Fallback to local cache also failed. Mapper will be empty.');
    }
  }
}

function getMappingByMalId(malId) {
  if (!isInitialized) {
    console.warn('[ID Mapper] Mapper is not initialized. Returning null.');
    return null;
  }
  return animeIdMap.get(parseInt(malId, 10)) || null;
}

module.exports = {
  initializeMapper,
  getMappingByMalId,
};
