const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const { redis } = require('./getCache'); 
const kitsu = require('./kitsu');

// from  https://github.com/Fribb/anime-lists
const REMOTE_MAPPING_URL = 'https://raw.githubusercontent.com/Fribb/anime-lists/refs/heads/master/anime-list-full.json';
const LOCAL_CACHE_PATH = path.join(__dirname, '..', 'data', 'anime-list-full.json.cache');
const REDIS_ETAG_KEY = 'anime-list-etag'; 

let animeIdMap = new Map();
let tvdbIdToAnimeListMap = new Map();
let isInitialized = false;
let tvdbIdMap = new Map();
const franchiseMapCache = new Map();
let tmdbIndexArray; 
const kitsuToImdbCache = new Map();
let imdbIdToAnimeListMap = new Map();

function processAndIndexData(jsonData) {
  const animeList = JSON.parse(jsonData);
  animeIdMap.clear();
  tvdbIdMap.clear();
  tvdbIdToAnimeListMap.clear();
  imdbIdToAnimeListMap.clear();
  for (const item of animeList) {
    if (item.mal_id) {
      animeIdMap.set(item.mal_id, item);
    }
    if (item.thetvdb_id) {
      const tvdbId = item.thetvdb_id;
      // If we haven't seen this TVDB ID before, create a new array for it
      if (!tvdbIdToAnimeListMap.has(tvdbId)) {
        tvdbIdToAnimeListMap.set(tvdbId, []);
      }
      tvdbIdToAnimeListMap.get(tvdbId).push(item);
    }
    if (item.imdb_id) {
      const imdbId = item.imdb_id;
      if (!imdbIdToAnimeListMap.has(imdbId)) {
        imdbIdToAnimeListMap.set(imdbId, []);
      }
      imdbIdToAnimeListMap.get(imdbId).push(item);
    }
  }
  tmdbIndexArray = animeList.filter(item => item.themoviedb_id);
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

/**
 * Creates a mapping of TVDB Season Number -> Kitsu ID for a given franchise.
 * This is the core of the new, reliable seasonal mapping.
 */
async function buildFranchiseMap(tvdbId) {
  const numericTvdbId = parseInt(tvdbId, 10);
  if (franchiseMapCache.has(numericTvdbId)) {
    return franchiseMapCache.get(numericTvdbId);
  }

  const franchiseSiblings = tvdbIdToAnimeListMap.get(numericTvdbId);
  if (!franchiseSiblings || franchiseSiblings.length === 0) return null;

  try {
    const kitsuIds = franchiseSiblings.map(s => s.kitsu_id).filter(Boolean);
    const kitsuDetails = await kitsu.getMultipleAnimeDetails(kitsuIds);
    const desiredTvTypes = new Set(['tv', 'ova', 'ona']);
    const kitsuTvSeasons = kitsuDetails.filter(item => 
        desiredTvTypes.has(item.attributes?.subtype.toLowerCase())
    );

    const sortedKitsuDetails = kitsuTvSeasons.sort((a, b) => {
      const aDate = new Date(a.attributes?.startDate || '9999-12-31');
      const bDate = new Date(b.attributes?.startDate || '9999-12-31');
      return aDate - bDate;
    });

    const seasonToKitsuMap = new Map();
    sortedKitsuDetails.forEach((kitsuItem, index) => {
      const seasonNumber = index + 1;
      seasonToKitsuMap.set(seasonNumber, parseInt(kitsuItem.id, 10));
    });

    console.log(`[ID Mapper] Built franchise map for TVDB ${tvdbId}:`, seasonToKitsuMap);
    franchiseMapCache.set(numericTvdbId, seasonToKitsuMap);
    return seasonToKitsuMap;

  } catch (error) {
    console.error(`[ID Mapper] Failed to build franchise map for TVDB ${tvdbId}:`, error);
    return null;
  }
}

/**
 * The public function to get a Kitsu ID for a specific TVDB season.
 * It uses the franchise map internally.
 */
async function resolveKitsuIdFromTvdbSeason(tvdbId, seasonNumber) {
    if (!isInitialized) return null;
    
    const franchiseMap = await buildFranchiseMap(tvdbId);
    if (!franchiseMap) {
      console.warn(`[ID Mapper] No franchise map available for TVDB ${tvdbId}`);
      return null;
    }
    
    const foundKitsuId = franchiseMap.get(seasonNumber) || null;
    if (foundKitsuId) {
      console.log(`[ID Mapper] Resolved TVDB S${seasonNumber} to Kitsu ID ${foundKitsuId}`);
    } else {
      console.warn(`[ID Mapper] No Kitsu ID found for S${seasonNumber} in franchise map for TVDB ${tvdbId}`);
    }
    return foundKitsuId;
}

function getSiblingsByImdbId(imdbId) {
  if (!isInitialized) return [];
  // IMDb IDs are strings, no need to parse.
  return imdbIdToAnimeListMap.get(imdbId) || [];
}

/**
 * Finds the corresponding IMDb ID and Season Number for a given Kitsu show ID.
 * It uses the shared IMDb ID as the franchise link.
 *
 * @param {string|number} kitsuId - The Kitsu ID of the anime season.
 * @returns {Promise<{imdbId: string, seasonNumber: number}|null>}
 */
async function resolveImdbSeasonFromKitsu(kitsuId) {
  const numericKitsuId = parseInt(kitsuId, 10);
  if (kitsuToImdbCache.has(numericKitsuId)) {
    return kitsuToImdbCache.get(numericKitsuId);
  }

  try {
    const baseMapping = getMappingByKitsuId(numericKitsuId);
    if (!baseMapping || !baseMapping.imdb_id) {
      throw new Error(`Incomplete mapping for Kitsu ID ${numericKitsuId}. Missing IMDb parent.`);
    }
    const parentImdbId = baseMapping.imdb_id;

    const siblings = getSiblingsByImdbId(parentImdbId);
    if (!siblings || siblings.length === 0) return null;

    if (siblings.length === 1) {
      const result = { imdbId: parentImdbId, seasonNumber: 1 };
      kitsuToImdbCache.set(numericKitsuId, result);
      return result;
    }

    const siblingKitsuIds = siblings.map(s => s.kitsu_id);
    const kitsuDetails = await kitsu.getMultipleAnimeDetails(siblingKitsuIds);

    const sortedKitsuSeasons = kitsuDetails
      .filter(k => k.attributes?.subtype === 'TV')
      .sort((a, b) => new Date(a.attributes.startDate) - new Date(b.attributes.startDate));

    const seasonIndex = sortedKitsuSeasons.findIndex(k => parseInt(k.id, 10) === numericKitsuId);

    if (seasonIndex !== -1) {
      const seasonNumber = seasonIndex + 1;
      const result = { imdbId: parentImdbId, seasonNumber: seasonNumber };
      console.log(`[ID Resolver] Mapped Kitsu ID ${numericKitsuId} to IMDb Season ${seasonNumber}`);
      kitsuToImdbCache.set(numericKitsuId, result);
      return result;
    }

    console.warn(`[ID Resolver] Could not determine season number for Kitsu ID ${numericKitsuId}.`);
    kitsuToImdbCache.set(numericKitsuId, null);
    return null;

  } catch (error) {
    console.error(`[ID Resolver] Error in resolveImdbSeasonFromKitsu for ${kitsuId}:`, error.message);
    return null;
  }
}



function getMappingByMalId(malId) {
  if (!isInitialized) {
    console.warn('[ID Mapper] Mapper is not initialized. Returning null.');
    return null;
  }
  return animeIdMap.get(parseInt(malId, 10)) || null;
}

function getMappingByKitsuId(kitsuId) {
  if (!isInitialized) return null;
  const numericKitsuId = parseInt(kitsuId, 10);
  const mapping = Array.from(animeIdMap.values()).find(item => item.kitsu_id === numericKitsuId);
  return mapping || null;
}

function getMappingByImdbId(imdbId) {
  if (!isInitialized) return null;
  const mapping = Array.from(animeIdMap.values()).find(item => item.imdb_id === imdbId);
  return mapping || null;
}

/**
 * Finds the mapping entry for a given TMDB ID.
 * This is more complex than other lookups because TMDB can have ID collisions
 * between movies and various series-like anime types (TV, OVA, ONA, etc.).
 * 
 * @param {number|string} tmdbId - The TMDB ID.
 * @param {string} type - The Stremio type ('movie' or 'series') to help disambiguate.
 * @returns {object|null} - The best matching mapping object, or null.
 */
function getMappingByTmdbId(tmdbId, type) {
  if (!isInitialized) return null;

  const numericTmdbId = parseInt(tmdbId, 10);
  
  const allMatches = tmdbIndexArray.filter(item => item.themoviedb_id === numericTmdbId);

  if (allMatches.length === 0) {
    return null;
  }
  
  if (allMatches.length === 1) {
    return allMatches[0];
  }

  console.log(`[ID Mapper] Found ${allMatches.length} potential matches for TMDB ID ${numericTmdbId}. Using type ('${type}') to find the best fit.`);

  if (type === 'movie') {
    const movieMatch = allMatches.find(item => item.type && item.type.toLowerCase() === 'movie');
    if (movieMatch) return movieMatch;
  }
  
  if (type === 'series') {
    const seriesLikeTypes = ['tv', 'ova', 'ona', 'special'];
    const seriesMatch = allMatches.find(item => item.type && seriesLikeTypes.includes(item.type.toLowerCase()));
    if (seriesMatch) return seriesMatch;
  }

  console.warn(`[ID Mapper] Could not disambiguate for TMDB ID ${numericTmdbId} with type '${type}'. Returning first available match.`);
  return allMatches[0];
}

function getMappingByTvdbId(tvdbId) {
  if (!isInitialized) return null;
  const numericTvdbId = parseInt(tvdbId, 10);
  const siblings = tvdbIdToAnimeListMap.get(numericTvdbId);
  return siblings?.[0] || null;
}

module.exports = {
  initializeMapper,
  getMappingByMalId,
  getMappingByTmdbId,
  getMappingByTvdbId,
  getMappingByImdbId,
  getMappingByKitsuId,
  resolveKitsuIdFromTvdbSeason,
  resolveImdbSeasonFromKitsu
};
