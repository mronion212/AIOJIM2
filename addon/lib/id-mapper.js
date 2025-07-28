const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

// from  https://github.com/Fribb/anime-lists
const REMOTE_MAPPING_URL = 'https://raw.githubusercontent.com/Fribb/anime-lists/refs/heads/master/anime-list-full.json';

const LOCAL_CACHE_PATH = path.join(__dirname, '..', 'data', 'anime-list-full.json.cache');


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
 * Tries to fetch the latest version from GitHub, caches it locally,
 * and falls back to the local cache if the fetch fails.
 */
async function initializeMapper() {
  if (isInitialized) {
    return;
  }

  let jsonData;
  let source;

  try {
    console.log(`[ID Mapper] Attempting to fetch latest mapping list from: ${REMOTE_MAPPING_URL}`);
    const response = await axios.get(REMOTE_MAPPING_URL, { timeout: 15000 });
    jsonData = JSON.stringify(response.data);
    source = 'Remote URL';

    try {
      await fs.mkdir(path.dirname(LOCAL_CACHE_PATH), { recursive: true });
      await fs.writeFile(LOCAL_CACHE_PATH, jsonData, 'utf-8');
      console.log(`[ID Mapper] Successfully saved latest mapping list to local cache.`);
    } catch (writeError) {
      console.error('[ID Mapper] Warning: Failed to write to local cache file.', writeError);
    }

  } catch (fetchError) {
    console.warn(`[ID Mapper] Warning: Could not fetch latest mapping list from GitHub. Error: ${fetchError.message}`);
    console.log('[ID Mapper] Attempting to fall back to local cache file...');

    try {
      jsonData = await fs.readFile(LOCAL_CACHE_PATH, 'utf-8');
      source = 'Local Cache';
    } catch (readError) {
      console.error('[ID Mapper] CRITICAL: Failed to fetch from URL and also failed to read from local cache file. The mapper will be empty.', readError);
      return; 
    }
  }

  if (jsonData) {
    console.log(`[ID Mapper] Processing data from: ${source}`);
    processAndIndexData(jsonData);
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
