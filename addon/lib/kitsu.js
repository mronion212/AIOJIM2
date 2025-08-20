const axios = require('axios');
const https = require('https');
const { cacheWrapGlobal } = require('./getCache');

// Use the same robust agent to ensure network stability
const robustAgent = new https.Agent({
  family: 4,
  keepAlive: true,
});

const KITSU_API_URL = 'https://kitsu.io/api/edge';

/**
 * Searches Kitsu for anime by a text query.
 * @param {string} query - The name of the anime to search for.
 * @returns {Promise<Array>} A promise that resolves to an array of Kitsu anime resource objects.
 */
async function searchByName(query) {
  if (!query) return [];
  const url = `${KITSU_API_URL}/anime?filter[text]=${encodeURIComponent(query)}`;
  try {
    const response = await axios.get(url, {
      httpsAgent: robustAgent,
      timeout: 10000,
    });
    return response.data?.data || []; // Kitsu nests results in a 'data' array
  } catch (error) {
    console.error(`[Kitsu Client] Error searching for "${query}":`, error.message);
    return [];
  }
}

/**
 * Fetches the full details for multiple anime by their Kitsu IDs in a single request.
 * @param {Array<string|number>} ids - An array of Kitsu IDs.
 * @returns {Promise<Array>} A promise that resolves to an array of Kitsu anime resource objects.
 */
async function getMultipleAnimeDetails(ids) {
  if (!ids || ids.length === 0) {
    return [];
  }
  // Kitsu API allows filtering by a comma-separated list of IDs.
  const idString = ids.join(',');
  const url = `${KITSU_API_URL}/anime?filter[id]=${idString}`;
  
  try {
    const response = await axios.get(url, {
      httpsAgent: robustAgent,
      timeout: 10000,
    });
    return response.data?.data || [];
  } catch (error) {
    console.error(`[Kitsu Client] Error fetching details for IDs ${idString}:`, error.message);
    return [];
  }
}

/**
 * Fetches episode data for an anime by its Kitsu ID.
 * @param {string|number} kitsuId - The Kitsu anime ID.
 * @returns {Promise<Array>} A promise that resolves to an array of episode objects.
 */
async function getAnimeEpisodes(kitsuId) {
  if (!kitsuId) return [];
  
  const cacheKey = `kitsu-episodes:${kitsuId}`;
  const cacheTTL = 3600; // 1 hour cache for episode data
  
  return cacheWrapGlobal(cacheKey, async () => {
    console.log(`[Kitsu Client] Fetching episodes for ID ${kitsuId}`);
    
    const allEpisodes = [];
    let nextUrl = `${KITSU_API_URL}/anime/${kitsuId}/episodes?page[limit]=20`;
    
    try {
      while (nextUrl) {
        const response = await axios.get(nextUrl, {
          httpsAgent: robustAgent,
          timeout: 10000,
        });
        
        const data = response.data;
        if (data?.data) {
          allEpisodes.push(...data.data);
          console.log(`[Kitsu Client] Fetched ${data.data.length} episodes (total so far: ${allEpisodes.length})`);
        }
        
        // Check if there's a next page
        nextUrl = data?.links?.next || null;
        
        // Add a small delay to be respectful to the API
        if (nextUrl) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      console.log(`[Kitsu Client] Total episodes fetched: ${allEpisodes.length}`);
      return allEpisodes;
    } catch (error) {
      console.error(`[Kitsu Client] Error fetching episodes for ID ${kitsuId}:`, error.message);
      return [];
    }
  }, cacheTTL);
}

module.exports = {
  searchByName,
  getMultipleAnimeDetails,
  getAnimeEpisodes,
};