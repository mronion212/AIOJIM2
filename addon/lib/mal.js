require("dotenv").config();
const axios = require('axios');

const JIKAN_API_BASE = process.env.JIKAN_API_BASE || 'https://api.jikan.moe/v4';

const BASE_REQUEST_DELAY = 350; 
const MAX_RETRIES = 3;          // Max number of times to retry a rate-limited request

let requestQueue = [];
let isProcessing = false;


async function processQueue() {
  if (requestQueue.length === 0) {
    isProcessing = false;
    return; 
  }

  isProcessing = true;
  const requestTask = requestQueue.shift();
  let nextDelay = BASE_REQUEST_DELAY; 

  try {
    const result = await requestTask.task();
    
    requestTask.resolve(result);
  } catch (error) {
    if (error.response && error.response.status === 429 && requestTask.retries < MAX_RETRIES) {
      requestTask.retries++; 

      const backoffTime = Math.pow(2, requestTask.retries - 1) * 1000;
      const jitter = Math.random() * 500; 
      nextDelay = backoffTime + jitter;

      console.warn(
        `Jikan rate limit hit. Retrying in ${Math.round(nextDelay)}ms. ` +
        `(Attempt ${requestTask.retries}/${MAX_RETRIES})`
      );

      requestQueue.unshift(requestTask);
    } else {
      if (requestTask.retries >= MAX_RETRIES) {
        console.error(`Jikan request failed for "${requestTask.url}" after ${MAX_RETRIES} retries. Giving up.`);
      }
      requestTask.reject(error);
    }
  }

  setTimeout(processQueue, nextDelay);
}

function enqueueRequest(task, url) {
  return new Promise((resolve, reject) => {
    requestQueue.push({ resolve, reject, task, url, retries: 0 });
    if (!isProcessing) {
      processQueue();
    }
  });
}

async function _makeJikanRequest(url) {
  console.log(`Jikan request for: ${url}`);
  return axios.get(url, { timeout: 15000 });
}

async function searchAnime(query, limit = 20, config = {}) {
  const url = `${JIKAN_API_BASE}/anime?q=${encodeURIComponent(query)}&limit=${limit}&order_by=popularity&sort=asc`;
  if (config.ageRating) {
    let jikanRating;
    switch (config.ageRating) {
      case "G": jikanRating = 'g'; break;
      case "PG": jikanRating = 'pg'; break;
      case "PG-13": jikanRating = 'pg13'; break;
      case "R": jikanRating = 'r17'; break;
    }

    if (jikanRating) {
      url += `&rating=${jikanRating}`;
    }
  }
  return enqueueRequest(() => _makeJikanRequest(url), url)
    .then(response => response.data?.data || [])
    .catch(e => {
      console.error(`A critical error occurred while searching for anime with query "${query}"`, e.message);
      return [];
    });
}

/**
 * Fetches detailed information for a specific anime by its MAL ID.
 */
async function getAnimeDetails(malId) {
  const url = `${JIKAN_API_BASE}/anime/${malId}/full`;
  return enqueueRequest(() => _makeJikanRequest(url), url)
    .then(response => response.data?.data || null)
    .catch(() => null); 
}


async function getAnimeEpisodes(malId) {
  console.log(`Fetching all episode data sequentially for MAL ID: ${malId}`);
  let allEpisodes = []; 

  try {
    const firstPageUrl = `${JIKAN_API_BASE}/anime/${malId}/episodes?page=1`;
    const firstPageResponse = await enqueueRequest(() => _makeJikanRequest(firstPageUrl), firstPageUrl);

    if (!firstPageResponse?.data?.data) {
      console.warn(`No valid episode data on first page for MAL ID ${malId}.`);
      return [];
    }

    allEpisodes.push(...firstPageResponse.data.data);
    const lastPage = firstPageResponse.data.pagination?.last_visible_page || 1;

    if (lastPage > 1) {
      for (let page = 2; page <= lastPage; page++) {
        const pageUrl = `${JIKAN_API_BASE}/anime/${malId}/episodes?page=${page}`;
       
        try {
          const pageResponse = await enqueueRequest(() => _makeJikanRequest(pageUrl), pageUrl);
          if (pageResponse?.data?.data) {
            allEpisodes.push(...pageResponse.data.data);
          }
        } catch (pageError) {
          console.error(`Failed to fetch episode page ${page} for MAL ID ${malId} after all retries. Skipping page.`);
        }
      }
    }

    console.log(`Finished fetching. Total episodes collected for MAL ID ${malId}: ${allEpisodes.length}`);
    return allEpisodes;

  } catch (error) {
    console.error(`A critical error occurred on the first page fetch for episodes of MAL ID ${malId}`, error.message);
    return [];
  }
}

async function getAnimeCharacters(malId) {
  const url = `${JIKAN_API_BASE}/anime/${malId}/characters`;
  return enqueueRequest(() => _makeJikanRequest(url), url)
    .then(response => response.data?.data || [])
    .catch(e => {
      console.error(`Could not fetch characters for MAL ID ${malId}:`, e.message);
      return [];
    });
}


async function getAnimeByVoiceActor(personId) {
  const url = `${JIKAN_API_BASE}/people/${personId}/full`;
  return enqueueRequest(() => _makeJikanRequest(url), url)
    .then(response => response.data?.data?.voices || [])
    .catch(e => {
      console.error(`Could not fetch roles for person ID ${personId}:`, e.message);
      return [];
    });
}

async function _getAnimeByGenrePage(genreId, typeFilter = null, page = 1, config = {}) {
  let url = `${JIKAN_API_BASE}/anime?genres=${genreId}&page=${page}&order_by=members&sort=desc&limit=25`;
  typeFilter = genreId === 12 ? 'ova' : typeFilter;
  if (typeFilter) {
    let jikanType = typeFilter.toLowerCase();
    if (jikanType === 'series') { jikanType = 'tv'; }
    url += `&type=${jikanType}`;
  }
  if (config.ageRating) {
    let jikanRating;
    switch (config.ageRating) {
      case "G": jikanRating = 'g'; break;
      case "PG": jikanRating = 'pg'; break;
      case "PG-13": jikanRating = 'pg13'; break;
      case "R": jikanRating = 'r17'; break;
    }
    if (jikanRating) { url += `&rating=${jikanRating}`; }
  }
  return enqueueRequest(() => _makeJikanRequest(url), url)
    .then(response => response.data || { data: [], pagination: {} }) 
    .catch(e => {
      console.error(`Could not fetch anime for genre ID ${genreId} with type filter "${typeFilter}"`, e.message);
      return { data: [], pagination: {} };
    });
}

async function getPaginatedAnimeByGenre(genreId, typeFilter = null, totalItemsToFetch = 50, config = {}) {
  const JIKAN_PAGE_LIMIT = 25;
  const desiredPages = Math.ceil(totalItemsToFetch / JIKAN_PAGE_LIMIT);

  const firstPageResponse = await _getAnimeByGenrePage(genreId, typeFilter, 1, config);
  if (!firstPageResponse || !firstPageResponse.data || firstPageResponse.data.length === 0) {
    console.log(`[Paginator] No results found on page 1 for genre ${genreId}.`);
    return [];
  }
  let allAnime = firstPageResponse.data;
  const lastVisiblePage = firstPageResponse.pagination?.last_visible_page || 1;

  const totalPagesToFetch = Math.min(desiredPages, lastVisiblePage);

  if (totalPagesToFetch > 1) {
    const pagePromises = [];
    for (let page = 2; page <= totalPagesToFetch; page++) {
      pagePromises.push(
        _getAnimeByGenrePage(genreId, typeFilter, page, config)
          .then(result => result?.data || [])
      );
    }
    const resultsByPage = await Promise.all(pagePromises);
    const subsequentAnime = resultsByPage.flat();
    allAnime = allAnime.concat(subsequentAnime);
  }
  return allAnime.slice(0, totalItemsToFetch);
}


async function getAnimeGenres() {
  const url = `${JIKAN_API_BASE}/genres/anime`;
  return enqueueRequest(() => _makeJikanRequest(url), url)
    .then(response => response.data?.data || [])
    .catch(e => {
      console.error(`Could not fetch anime genres from Jikan`, e.message);
      return [];
    });
}

module.exports = {
  searchAnime,
  getAnimeDetails,
  getAnimeEpisodes,
  getAnimeCharacters,
  getAnimeByVoiceActor,
  getAnimeByGenre: getPaginatedAnimeByGenre,
  getAnimeGenres,
};
