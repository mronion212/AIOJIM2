const { fetch, Agent } = require('undici');
const { socksDispatcher } = require('fetch-socks');

const TMDB_API_URL = 'https://api.themoviedb.org/3';


const SOCKS_PROXY_URL = process.env.TMDB_SOCKS_PROXY_URL;
let dispatcher;

if (SOCKS_PROXY_URL) {
  try {
    const proxyUrlObj = new URL(SOCKS_PROXY_URL);
    if (proxyUrlObj.protocol === 'socks5:' || proxyUrlObj.protocol === 'socks4:') {
      dispatcher = socksDispatcher({
        type: proxyUrlObj.protocol === 'socks5:' ? 5 : 4,
        host: proxyUrlObj.hostname,
        port: parseInt(proxyUrlObj.port),
        userId: proxyUrlObj.username,
        password: proxyUrlObj.password,
      });
      console.log(`[TMDB] SOCKS proxy is enabled for undici via fetch-socks.`);
    } else {
      console.error(`[TMDB] Unsupported proxy protocol: ${proxyUrlObj.protocol}. Using direct connection.`);
      dispatcher = new Agent({ connect: { timeout: 10000 } });
    }
  } catch (error) {
    console.error(`[TMDB] Invalid SOCKS_PROXY_URL. Using direct connection. Error: ${error.message}`);
    dispatcher = new Agent({ connect: { timeout: 10000 } });
  }
} else {
  dispatcher = new Agent({ connect: { timeout: 10000 } });
  console.log('[TMDB] undici agent is enabled for direct connections.');
}


/**
 * A centralized helper to make authenticated requests to the TMDB API using undici.
 * It correctly uses the globally defined dispatcher (either SOCKS or direct).
 */
async function makeTmdbRequest(endpoint, apiKey, params = {}, method = 'GET', body = null) {
  if (!apiKey) throw new Error("TMDB API key is required.");
  
  const queryForUrl = {};

  for (const key in params) {
    if (params[key] !== undefined && params[key] !== null) {
      queryForUrl[key] = String(params[key]);
    }
  }
  
  const queryParams = new URLSearchParams(queryForUrl);
  queryParams.append('api_key', apiKey);
  
  const url = `${TMDB_API_URL}${endpoint}?${queryParams.toString()}`;
  
  try {
    const response = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      dispatcher: dispatcher,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const errorMessage = errorBody.status_message || `Request failed with status ${response.status}`;
      throw new Error(errorMessage);
    }
    return response.json();
  } catch (error) {
    throw new Error(`[TMDB] Request to ${endpoint} failed: ${error.message}`);
  }
}

const accountDetailsCache = new Map();
async function getAccountDetails(sessionId, apiKey) {
    if (!sessionId) throw new Error("Session ID is required for account actions.");
    if (accountDetailsCache.has(sessionId)) {
        return accountDetailsCache.get(sessionId);
    }
    const details = await makeTmdbRequest('/account', apiKey, { session_id: sessionId });
    if (details) {
        accountDetailsCache.set(sessionId, details);
    }
    return details;
}
function getApiKey(config) {
    const key = config.apiKeys?.tmdb || process.env.TMDB_API;
    if (!key) throw new Error("TMDB API key not found in config or environment.");
    return key;
}

async function movieInfo(params, config) {
  const { id, ...queryParams } = params;
  return makeTmdbRequest(`/movie/${id}`, getApiKey(config), queryParams);
}
async function tvInfo(params, config) {
  const { id, ...queryParams } = params;
  return makeTmdbRequest(`/tv/${id}`, getApiKey(config), queryParams);
}
async function searchMovie(params, config) {
  return makeTmdbRequest('/search/movie', getApiKey(config), params);
}

async function searchTv(params, config) {
  return makeTmdbRequest('/search/tv', getApiKey(config), params);
}

async function discoverMovie(params, config) {
  return makeTmdbRequest('/discover/movie', getApiKey(config), params);
}

async function discoverTv(params, config) {
  return makeTmdbRequest('/discover/tv', getApiKey(config), params);
}

async function genreMovieList(params, config) {
  return makeTmdbRequest('/genre/movie/list', getApiKey(config), params);
}



async function requestToken(config) { 
  return makeTmdbRequest('/authentication/token/new', getApiKey(config));
}

async function sessionId(params, config) { 
  return makeTmdbRequest('/authentication/session/new', getApiKey(config), {}, 'POST', params);
}

async function accountFavoriteMovies(params, config) {
  const apiKey = getApiKey(config);
  const account = await getAccountDetails(params.session_id, apiKey);
  return makeTmdbRequest(`/account/${account.id}/favorite/movies`, apiKey, params);
}

async function accountFavoriteTv(params, config) {
  const apiKey = getApiKey(config);
  const account = await getAccountDetails(params.session_id, apiKey);
  return makeTmdbRequest(`/account/${account.id}/favorite/tv`, apiKey, params);
}

async function accountMovieWatchlist(params, config) {
  const apiKey = getApiKey(config);
  const account = await getAccountDetails(params.session_id, apiKey);
  return makeTmdbRequest(`/account/${account.id}/watchlist/movies`, apiKey, params);
}

async function accountTvWatchlist(params, config) {
  const apiKey = getApiKey(config);
  const account = await getAccountDetails(params.session_id, apiKey);
  return makeTmdbRequest(`/account/${account.id}/watchlist/tv`, apiKey, params);
}

module.exports = {
  movieInfo,
  tvInfo,
  searchMovie,
  searchTv,
  searchPerson: (params, config) => makeTmdbRequest('/search/person', getApiKey(config), params),
  find: (params, config) => makeTmdbRequest(`/find/${params.id}`, getApiKey(config), { external_source: params.external_source }),
  languages: (config) => makeTmdbRequest('/configuration/languages', getApiKey(config)),
  primaryTranslations: (config) => makeTmdbRequest('/configuration/primary_translations', getApiKey(config)),
  discoverMovie,
  discoverTv,
  personMovieCredits: (params, config) => makeTmdbRequest(`/person/${params.id}/movie_credits`, getApiKey(config), params),
  personTvCredits: (params, config) => makeTmdbRequest(`/person/${params.id}/tv_credits`, getApiKey(config), params),
  seasonInfo: (params, config) => makeTmdbRequest(`/tv/${params.id}/season/${params.season_number}`, getApiKey(config), params),
  trending: (params, config) => makeTmdbRequest(`/trending/${params.media_type}/${params.time_window}`, getApiKey(config), params),
  movieImages: (params, config) => makeTmdbRequest(`/movie/${params.id}/images`, getApiKey(config), params),
  tvImages: (params, config) => makeTmdbRequest(`/tv/${params.id}/images`, getApiKey(config), params),
  genreMovieList,
  genreTvList: (params, config) => makeTmdbRequest('/genre/tv/list', getApiKey(config), params),
  requestToken,
  sessionId,
  accountFavoriteMovies,
  accountFavoriteTv,
  accountMovieWatchlist,
  accountTvWatchlist
};