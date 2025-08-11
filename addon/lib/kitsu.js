const axios = require('axios');
const https = require('https');

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

module.exports = {
  searchByName,
  getMultipleAnimeDetails,
};