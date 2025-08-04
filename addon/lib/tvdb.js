require('dotenv').config();
const { cacheWrapTvdbApi } = require('./getCache');
const { to3LetterCode } = require('./language-map');
const fetch = require('node-fetch');

const TVDB_API_URL = 'https://api4.thetvdb.com/v4';
const GLOBAL_TVDB_KEY = process.env.TVDB_API_KEY;

const tokenCache = new Map();

async function getAuthToken(apiKey) {
  const key = apiKey || GLOBAL_TVDB_KEY;
  if (!key) {
    console.error('TVDB API Key is not configured.');
    return null;
  }

  const cached = tokenCache.get(key);
  if (cached && Date.now() < cached.expiry) {
    return cached.token;
  }

  try {
    const response = await fetch(`${TVDB_API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apikey: key }),
    });
    if (!response.ok) {
      console.error(`Failed to get TVDB auth token for key ...${key.slice(-4)}: ${response.statusText}`);
      return null;
    }
    const data = await response.json();
    const token = data.data.token;
    const expiry = Date.now() + (28 * 24 * 60 * 60 * 1000);
    
    tokenCache.set(key, { token, expiry });
    return token;
  } catch (error) {
    console.error(`Failed to get TVDB auth token for key ...${key.slice(-4)}:`, error.message);
    return null;
  }
}

async function searchSeries(query, config) {
  const token = await getAuthToken(config.apiKeys?.tvdb);
  if (!token) return [];
  try {
    const response = await fetch(`${TVDB_API_URL}/search?query=${encodeURIComponent(query)}&type=series`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!response.ok) return [];
    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error(`Error searching TVDB for series "${query}":`, error.message);
    return [];
  }
}

async function searchMovies(query, config) {
  const token = await getAuthToken(config.apiKeys?.tvdb);
  if (!token) return [];
  try {
    const response = await fetch(`${TVDB_API_URL}/search?query=${encodeURIComponent(query)}&type=movie`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!response.ok) return [];
    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error(`Error searching TVDB for series "${query}":`, error.message);
    return [];
  }
}

async function searchPeople(query, config) {
  const token = await getAuthToken(config.apiKeys?.tvdb);
  if (!token) return [];
  try {
    const response = await fetch(`${TVDB_API_URL}/search?query=${encodeURIComponent(query)}&type=person`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!response.ok) return [];
    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error(`Error searching TVDB for person "${query}":`, error.message);
    return [];
  }
}

async function getSeriesExtended(tvdbId, config) {
  return cacheWrapTvdbApi(`series-extended:${tvdbId}`, async () => {
    const token = await getAuthToken(config.apiKeys?.tvdb);
    if (!token) return null;

    const url = `${TVDB_API_URL}/series/${tvdbId}/extended?meta=translations`;
    try {
      const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!response.ok) return null;
      const data = await response.json();
      return data.data;
    } catch(error) {
      console.error(`Error fetching extended series data for TVDB ID ${tvdbId}:`, error.message);
      return null; 
    }
  });
}

async function getMovieExtended(tvdbId, config) {
  return cacheWrapTvdbApi(`movie-extended:${tvdbId}`, async () => {
    const token = await getAuthToken(config.apiKeys?.tvdb);
    if (!token) return null;

    const url = `${TVDB_API_URL}/movies/${tvdbId}/extended?meta=translations`;
    try {
      const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!response.ok) return null;
      const data = await response.json();
      return data.data;
    } catch(error) {
      console.error(`Error fetching extended series data for TVDB ID ${tvdbId}:`, error.message);
      return null; 
    }
  });
}


async function findByImdbId(imdbId, config) {
  const token = await getAuthToken(config.apiKeys?.tvdb);
  if (!token || !imdbId) return null;

  try {
    const response = await fetch(`${TVDB_API_URL}/search/remoteid/${imdbId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) return null;
    
    const data = await response.json();
    const match = data.data?.[0]; 

    if (match) {
        console.log(`[TVDB] Found match for remote ID ${imdbId}: TVDB ID ${match.id} (Type: ${match.type})`);
        return match;
    }
    return null;
  } catch (error) {
    console.error(`[TVDB] Error in findByImdbId for ${imdbId}:`, error.message);
    return null;
  }
}

async function getPersonExtended(personId, config) {
  const token = await getAuthToken(config.apiKeys?.tvdb);
  if (!token) return null;
  try {
    const response = await fetch(`${TVDB_API_URL}/people/${personId}/extended`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.data;
  } catch(error) {
    console.error(`Error fetching extended person data for Person ID ${personId}:`, error.message);
    return null;
  }
}

async function _fetchEpisodesBySeasonType(tvdbId, seasonType, language, config) {
  const token = await getAuthToken(config.apiKeys?.tvdb);
  if (!token) return null;

  const langCode3 = await to3LetterCode(language.split('-')[0], config);
  
  let allEpisodes = [];
  let page = 0;
  let hasNextPage = true;

  while(hasNextPage) {
    const url = `${TVDB_API_URL}/series/${tvdbId}/episodes/${seasonType}/${langCode3}?page=${page}`;
    try {
      const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!response.ok) {
        console.warn(`[TVDB] API returned non-OK status for ${seasonType} episodes of ${tvdbId}.`);
        hasNextPage = false;
        continue;
      }
      const data = await response.json();
      if (data.data && data.data.episodes) {
        allEpisodes.push(...data.data.episodes);
      }
      hasNextPage = data.links && data.links.next;
      page++;
    } catch(error) {
      console.error(`Error fetching page ${page} of ${seasonType} episodes for TVDB ID ${tvdbId}:`, error.message);
      hasNextPage = false;
    }
  }
  return { episodes: allEpisodes };
}

async function getSeriesEpisodes(tvdbId, language = 'en-US', seasonType = 'default', config = {},  bypassCache = false) {
  const cacheKey = `series-episodes:${tvdbId}:${language}:${seasonType}`;

  return cacheWrapTvdbApi(cacheKey, async () => {
    console.log(`[TVDB] Fetching episodes for ${tvdbId} with type: '${seasonType}' and lang: '${language}'`);
    let result = await _fetchEpisodesBySeasonType(tvdbId, seasonType, language, config);
 
    if ((!result || result.episodes.length === 0) && seasonType !== 'default') {
      console.warn(`[TVDB] No episodes found for type '${seasonType}'. Falling back to 'default' order.`);
      result = await _fetchEpisodesBySeasonType(tvdbId, 'default', language, config);
    }

    if ((!result || result.episodes.length === 0) && language !== 'en-US') {
      console.warn(`[TVDB] No episodes found in '${language}'. Falling back to 'en-US'.`);
      return getSeriesEpisodes(tvdbId, 'en-US', seasonType, config, true); 
    }
    
    return result;
  }, bypassCache);
}

module.exports = {
  searchSeries,
  searchMovies,
  searchPeople,
  getSeriesExtended,
  getMovieExtended,
  getPersonExtended,
  getSeriesEpisodes,
  findByImdbId
};
