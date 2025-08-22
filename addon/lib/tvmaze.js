const axios = require('axios');
const TVMAZE_API_URL = 'https://api.tvmaze.com';
const DEFAULT_TIMEOUT = 10000; // 10-second timeout for all requests

/**
 * A helper to check for 404s and returns a specific value, otherwise logs the error.
 */
function handleAxiosError(error, context) {
  if (error.response && error.response.status === 404) {
    console.log(`${context}: Resource not found (404).`);
    return { notFound: true };
  }
  console.error(`Error in ${context}:`, error.message);
  return { error: true };
}


/**
 * Gets the basic show object from TVmaze using an IMDb ID.
 */
async function getShowByImdbId(imdbId) {
  const url = `${TVMAZE_API_URL}/lookup/shows?imdb=${imdbId}`;
  try {
    const response = await axios.get(url, { timeout: DEFAULT_TIMEOUT });
    return response.data;
  } catch (error) {
    const { notFound } = handleAxiosError(error, `getShowByImdbId for IMDb ${imdbId}`);
    return notFound ? null : null; 
  }
}

/**
 * Gets the full show details, including all episodes and cast, using a TVmaze ID.
 */
async function getShowDetails(tvmazeId) {
  const url = `${TVMAZE_API_URL}/shows/${tvmazeId}?embed[]=episodes&embed[]=cast&embed[]=crew`;
  try {
    const response = await axios.get(url, { timeout: DEFAULT_TIMEOUT });
    return response.data;
  } catch (error) {
    const { notFound } = handleAxiosError(error, `getShowDetails for TVmaze ID ${tvmazeId}`);
    return notFound ? null : null;
  }
}
/**
 * Gets the full show namely to retrieve external ids, using a TVmaze ID.
 */
async function getShowById(tvmazeId) {
  const url = `${TVMAZE_API_URL}/shows/${tvmazeId}`;
  try {
    const response = await axios.get(url, { timeout: DEFAULT_TIMEOUT });
    return response.data;
  } catch (error) {
    const { notFound } = handleAxiosError(error, `getShowById for TVmaze ID ${tvmazeId}`);
    return notFound ? null : null;
  }
}


/**
 * Searches for shows on TVmaze based on a query.
 */
async function searchShows(query) {
  const url = `${TVMAZE_API_URL}/search/shows?q=${encodeURIComponent(query)}`;
  try {
    const response = await axios.get(url, { timeout: DEFAULT_TIMEOUT });
    return response.data;
  } catch (error) {
    handleAxiosError(error, `searchShows for query "${query}"`);
    return []; 
  }
}

/**
 * Gets the basic show object from TVmaze using a TVDB ID.
 */
async function getShowByTvdbId(tvdbId) {
  const url = `${TVMAZE_API_URL}/lookup/shows?thetvdb=${tvdbId}`;
  try {
    const response = await axios.get(url, { timeout: DEFAULT_TIMEOUT });
    return response.data;
  } catch (error) {
    const { notFound } = handleAxiosError(error, `getShowByTvdbId for TVDB ${tvdbId}`);
    return notFound ? null : null;
  }
}

/**
 * Searches for people on TVmaze.
 */
async function searchPeople(query) {
  const url = `${TVMAZE_API_URL}/search/people?q=${encodeURIComponent(query)}`;
  try {
    const response = await axios.get(url, { timeout: DEFAULT_TIMEOUT });
    return response.data;
  } catch (error) {
    handleAxiosError(error, `searchPeople for person "${query}"`);
    return [];
  }
}

/**
 * Gets all cast credits for a person.
 */
async function getPersonCastCredits(personId) {
  const url = `${TVMAZE_API_URL}/people/${personId}/castcredits?embed=show`;
  try {
    const response = await axios.get(url, { timeout: DEFAULT_TIMEOUT });
    return response.data;
  } catch (error) {
    handleAxiosError(error, `getPersonCastCredits for person ID ${personId}`);
    return [];
  }
}

module.exports = {
  getShowByImdbId,
  getShowDetails,
  getShowByTvdbId,
  searchShows,
  searchPeople,
  getPersonCastCredits,
  getShowById
};