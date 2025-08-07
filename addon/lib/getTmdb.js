const { MovieDb } = require("moviedb-promise");
const { SocksProxyAgent } = require('socks-proxy-agent');
const https = require('https'); 

const robustAgent = new https.Agent({
  keepAlive: true, 
  maxSockets: 100,
  maxFreeSockets: 10,
  timeout: 60000,
  freeSocketTimeout: 30000,
  family: 4 // Force IPv4
});

const SOCKS_PROXY_URL = process.env.TMDB_SOCKS_PROXY_URL;
let agent;
let axiosConfig;

if (SOCKS_PROXY_URL) {
  agent = new SocksProxyAgent(SOCKS_PROXY_URL);
  // For SOCKS, both http and https agents must be the same
  axiosConfig = { httpAgent: agent, httpsAgent: agent };
  console.log(`[TMDB] SOCKS5 proxy is enabled.`);
} else {
  agent = robustAgent;
  // For standard HTTPS, we only need to specify the httpsAgent
  axiosConfig = { httpsAgent: agent };
  console.log(`[TMDB] Robust networking agent is enabled (IPv4 Forced, Keep-Alive On).`);
}

const moviedbClientCache = new Map();

/**
 * Gets a configured and initialized MovieDb (TMDB) client for a given API key.
 * This function is the single source of truth for the TMDB client.
 * It caches clients to avoid re-initializing on every request.
 *
 * @param {string} apiKey - The user-provided TMDB API key.
 * @returns {MovieDb|null} An initialized MovieDb instance, or null if no key is provided.
 */
function getTmdbClient(apiKey) {
  if (!apiKey) {
    console.warn('[TMDB Client] Attempted to get client without an API key.');
    return null;
  }

  if (moviedbClientCache.has(apiKey)) {
    return moviedbClientCache.get(apiKey);
  }

  try {
    const newClient = new MovieDb(apiKey);
    
    moviedbClientCache.set(apiKey, newClient);
    console.log(`[TMDB Client] Caching new client for API key ending in ...${apiKey.slice(-4)}`);
    
    return newClient;
  } catch (error) {
    console.error(`[TMDB Client] Failed to initialize client for key ending in ...${apiKey.slice(-4)}:`, error.message);
    return null;
  }
}


async function movieInfo(params, config) {
    const moviedb = getTmdbClient(config.apiKeys?.tmdb || process.env.TMDB_API);
    if (!moviedb) throw new Error("TMDB Client not available. Check API Key.");
    return moviedb.movieInfo(params, axiosConfig);
}

async function tvInfo(params, config) {
    const moviedb = getTmdbClient(config.apiKeys?.tmdb || process.env.TMDB_API);
    if (!moviedb) throw new Error("TMDB Client not available. Check API Key.");
    return moviedb.tvInfo(params, axiosConfig);
}

async function searchMovie(params, config) {
    const moviedb = getTmdbClient(config.apiKeys?.tmdb || process.env.TMDB_API);
    if (!moviedb) throw new Error("TMDB Client not available. Check API Key.");
    return moviedb.searchMovie(params, axiosConfig);
}

async function searchTv(params, config) {
    const moviedb = getTmdbClient(config.apiKeys?.tmdb || process.env.TMDB_API);
    if (!moviedb) throw new Error("TMDB Client not available. Check API Key.");
    return moviedb.searchTv(params, axiosConfig);
}

async function searchPerson(params, config) {
    const moviedb = getTmdbClient(config.apiKeys?.tmdb || process.env.TMDB_API);
    if (!moviedb) throw new Error("TMDB Client not available. Check API Key.");
    return moviedb.searchPerson(params, axiosConfig);
}

async function find(params, config) {
    const moviedb = getTmdbClient(config.apiKeys?.tmdb || process.env.TMDB_API);
    if (!moviedb) throw new Error("TMDB Client not available. Check API Key.");
    return moviedb.find(params, axiosConfig);
}

async function primaryTranslations(config) {
    const moviedb = getTmdbClient(config.apiKeys?.tmdb || process.env.TMDB_API);
    if (!moviedb) throw new Error("TMDB Client not available. Check API Key.");
    return moviedb.primaryTranslations(axiosConfig);
}

async function languages(config) {
    const moviedb = getTmdbClient(config.apiKeys?.tmdb || process.env.TMDB_API);
    if (!moviedb) throw new Error("TMDB Client not available. Check API Key.");
    return moviedb.languages(axiosConfig);
}

async function discoverMovie(params, config) {
    const moviedb = getTmdbClient(config.apiKeys?.tmdb || process.env.TMDB_API);
    if (!moviedb) throw new Error("TMDB Client not available. Check API Key.");
    return moviedb.discoverMovie(params, config);}

async function discoverTv(params, config) {
    const moviedb = getTmdbClient(config.apiKeys?.tmdb || process.env.TMDB_API);
    if (!moviedb) throw new Error("TMDB Client not available. Check API Key.");
    return moviedb.discoverTv(params, config);
}

async function personMovieCredits(params, config) {
    const moviedb = getTmdbClient(config.apiKeys?.tmdb || process.env.TMDB_API);
    if (!moviedb) throw new Error("TMDB Client not available. Check API Key.");
    return moviedb.personMovieCredits(params, axiosConfig);
}

async function personTvCredits(params, config) {
    const moviedb = getTmdbClient(config.apiKeys?.tmdb || process.env.TMDB_API);
    if (!moviedb) throw new Error("TMDB Client not available. Check API Key.");
    return moviedb.personTvCredits(params, axiosConfig);
}

async function seasonInfo(params, config) {
    const moviedb = getTmdbClient(config.apiKeys?.tmdb || process.env.TMDB_API);
    if (!moviedb) throw new Error("TMDB Client not available. Check API Key.");
    return moviedb.seasonInfo(params, axiosConfig);
}

async function trending(params, config) {
    const moviedb = getTmdbClient(config.apiKeys?.tmdb || process.env.TMDB_API);
    if (!moviedb) throw new Error("TMDB Client not available. Check API Key.");
    return moviedb.trending(params, axiosConfig);
}

async function movieImages(params, config) {
    const moviedb = getTmdbClient(config.apiKeys?.tmdb || process.env.TMDB_API);
    if (!moviedb) throw new Error("TMDB Client not available. Check API Key.");
    return moviedb.movieImages(params, axiosConfig);
}

async function tvImages(params, config) {
    const moviedb = getTmdbClient(config.apiKeys?.tmdb || process.env.TMDB_API);
    if (!moviedb) throw new Error("TMDB Client not available. Check API Key.");
    return moviedb.tvImages(params, axiosConfig);
}

async function genreMovieList(language, config) {
    const moviedb = getTmdbClient(config.apiKeys?.tmdb || process.env.TMDB_API);
    if (!moviedb) throw new Error("TMDB Client not available. Check API Key.");
    return moviedb.genreMovieList({ language }, axiosConfig);
}

async function genreTvList(language, config) {
    const moviedb = getTmdbClient(config.apiKeys?.tmdb || process.env.TMDB_API);
    if (!moviedb) throw new Error("TMDB Client not available. Check API Key.");
    return moviedb.genreTvList({ language }, axiosConfig);
}

async function sessionId(config) {
    const moviedb = getTmdbClient(config.apiKeys?.tmdb || process.env.TMDB_API);
    if (!moviedb) throw new Error("TMDB Client not available. Check API Key.");
    return moviedb.sessionId(axiosConfig);
}

async function accountFavoriteMovies(params, config) {
    const moviedb = getTmdbClient(config.apiKeys?.tmdb || process.env.TMDB_API);
    if (!moviedb) throw new Error("TMDB Client not available. Check API Key.");
    return moviedb.accountFavoriteMovies(params, axiosConfig);
}

async function accountFavoriteTv(params, config) {
    const moviedb = getTmdbClient(config.apiKeys?.tmdb || process.env.TMDB_API);
    if (!moviedb) throw new Error("TMDB Client not available. Check API Key.");
    return moviedb.accountFavoriteTv(params, axiosConfig);
}

async function accountMovieWatchlist(params, config) {
    const moviedb = getTmdbClient(config.apiKeys?.tmdb || process.env.TMDB_API);
    if (!moviedb) throw new Error("TMDB Client not available. Check API Key.");
    return moviedb.accountMovieWatchlist(params, axiosConfig);
}

async function accountTvWatchlist(params, config) {
    const moviedb = getTmdbClient(config.apiKeys?.tmdb || process.env.TMDB_API);
    if (!moviedb) throw new Error("TMDB Client not available. Check API Key.");
    return moviedb.accountTvWatchlist(params, axiosConfig);
}


module.exports = {
  getTmdbClient, 
  movieInfo,
  tvInfo,
  searchMovie,
  searchTv,
  searchPerson,
  find,
  languages,
  primaryTranslations,
  discoverMovie,
  discoverTv,
  personMovieCredits,
  personTvCredits,
  seasonInfo,
  trending,
  movieImages,
  tvImages,
  genreMovieList,
  genreTvList,
  sessionId,
  accountFavoriteMovies,
  accountFavoriteTv,
  accountMovieWatchlist,
  accountTvWatchlist
};
