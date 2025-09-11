require("dotenv").config();
const { getGenreList } = require("./getGenreList");
const { getLanguages } = require("./getLanguages");
const { fetchMDBListItems, parseMDBListItems } = require("../utils/mdbList");
const { fetchStremThruCatalog, parseStremThruItems } = require("../utils/stremthru");
const CATALOG_TYPES = require("../static/catalog-types.json");
const moviedb = require("./getTmdb");
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
const TVDB_IMAGE_BASE = 'https://artworks.thetvdb.com';
const tvdb = require('./tvdb');
const { to3LetterCode, to3LetterCountryCode } = require('./language-map');
const Utils = require('../utils/parseProps');
const { resolveAllIds } = require('./id-resolver');
const { cacheWrapTvdbApi } = require('./getCache');
const { getTVDBContentRatingId } = require('../utils/tvdbContentRating');
const { getImdbRating } = require('./getImdbRating');

/**
 * Generates a fallback IMDb-style ID for items without IMDb ID
 * @param {string} provider - The provider (tmdb, tvdb, etc.)
 * @param {string} id - The original ID
 * @returns {string} A fallback ID with tt prefix
 */
function generateFallbackImdbId(provider, id) {
  // Create a deterministic fallback ID based on provider and original ID
  const cleanId = String(id).replace(/[^a-zA-Z0-9]/g, '');
  const fallbackId = `tt${provider}${cleanId}`;
  return fallbackId.length > 7 ? fallbackId.substring(0, 7) : fallbackId.padStart(7, '0');
}

require('dotenv').config();
const host = process.env.HOST_NAME 
  ? (process.env.HOST_NAME.startsWith('http')
      ? process.env.HOST_NAME
      : `https://${process.env.HOST_NAME}`)
  : 'http://localhost:1337';


async function getCatalog(type, language, page, id, genre, config, userUUID) {
  try {
    if (id === 'tvdb.collections') {
      console.log(`[getCatalog] Fetching TVDB collections catalog: ${id}`);
      const metas = await getTvdbCollectionsCatalog(type, id, page, language, config);
      return { metas: metas };
    }
    if (id.startsWith('tvdb.') && !id.startsWith('tvdb.collection.')) {
      console.log(`[getCatalog] Routing to TVDB catalog handler for id: ${id}`);
      const tvdbResults = await getTvdbCatalog(type, id, genre, page, language, config);
      return { metas: tvdbResults };
    } 
    else if (id.startsWith('tmdb.') || id.startsWith('mdblist.') || id.startsWith('streaming.')) {
      console.log(`[getCatalog] Routing to TMDB/MDBList catalog handler for id: ${id}`);
      const tmdbResults = await getTmdbAndMdbListCatalog(type, id, genre, page, language, config, userUUID);
      return { metas: tmdbResults };
    }
    else if (id.startsWith('stremthru.')) {
      console.log(`[getCatalog] Routing to StremThru catalog handler for id: ${id}`);
      const stremthruResults = await getStremThruCatalog(type, id, genre, page, language, config, userUUID);
      return { metas: stremthruResults };
    }
    else if (id.startsWith('imdb.')) {
      console.log(`[getCatalog] Routing to IMDb catalog handler for id: ${id}`);
      const imdbResults = await getImdbCatalog(type, id, genre, page, language, config, userUUID);
      return { metas: imdbResults };
    }

    else {
      console.warn(`[getCatalog] Received request for unknown catalog prefix: ${id}`);
      return { metas: [] };
    }
  } catch (error) {
    console.warn(`[getCatalog] Error in getCatalog router for id=${id}, type=${type}:`, error.message);
    return { metas: [] };
  }
}

async function getTvdbCatalog(type, catalogId, genreName, page, language, config) {
  console.log(`[getCatalog] Fetching TVDB catalog: ${catalogId}, Genre: ${genreName}, Page: ${page}`);
  
  // Cache the raw TVDB API response using a cache key that doesn't include page
  const cacheKey = `tvdb-filter:${type}:${genreName}:${language}`;
  
  const allTvdbGenres = await getGenreList('tvdb', language, type, config);
  console.log(`[getCatalog] TVDB genres fetched: ${allTvdbGenres.length} genres available`);
  
  const genre = allTvdbGenres.find(g => g.name === genreName);
  console.log(`[getCatalog] Genre lookup for "${genreName}":`, genre ? `Found ID ${genre.id}` : 'NOT FOUND');
  
  const langParts = language.split('-');
  const langCode2 = langParts[0];
  const countryCode2 = langParts[1] || langCode2; 
  const langCode3 = await to3LetterCode(langCode2, config);
  const countryCode3 = to3LetterCountryCode(countryCode2);
  const tvdbContentRatingId = getTVDBContentRatingId(config.ageRating, countryCode3, type === 'movie' ? 'movie' : 'episode');
  
  const params = {
    country: countryCode3 || 'usa',
    lang: langCode3 || 'eng',
    sort: 'score'
  };

  if (tvdbContentRatingId) {
    console.log(`[getCatalog] Using TVDB content rating ID ${tvdbContentRatingId} for TVDB filter`);
    params.contentRating = tvdbContentRatingId;
  }

  if (genre) {
    params.genre = genre.id;
    console.log(`[getCatalog] Using genre ID ${genre.id} for TVDB filter`);
  } else {
    console.log(`[getCatalog] WARNING: No genre found for "${genreName}", proceeding without genre filter`);
  }
  
  const tvdbType = type === 'movie' ? 'movies' : 'series';
  if(tvdbType === 'series'){
    params.sortType = 'desc';
  }
  
  console.log(`[getCatalog] TVDB filter params:`, JSON.stringify(params));
  
  // Use cacheWrapTvdbApi to cache the raw API response
  const results = await cacheWrapTvdbApi(cacheKey, async () => {
    return await tvdb.filter(tvdbType, params, language, config);
  });
  
  console.log(`[getCatalog] TVDB filter results: ${results ? results.length : 0} items returned`);
  
  if (!results || results.length === 0) {
    console.log(`[getCatalog] No results from TVDB filter, returning empty array`);
    return [];
  }

  // Sort results by score (highest first)
  const sortedResults = results.sort((a, b) => b.score - a.score);
  
  // Apply client-side pagination
  const pageSize = 20;
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedResults = sortedResults.slice(startIndex, endIndex);
  
  console.log(`[getCatalog] Pagination: page ${page}, showing items ${startIndex + 1}-${Math.min(endIndex, sortedResults.length)} of ${sortedResults.length} total results`);

  const allMetas = await Promise.all(paginatedResults.map(async item => {
    const tvdbId = item.id;
    const allIds = await resolveAllIds(`tvdb:${tvdbId}`, type, config);
    if (!tvdbId) return null;
    const fallbackPosterUrl = item.image ? (item.image.startsWith('http') ? item.image : `${TVDB_IMAGE_BASE}${item.image}`) : `https://artworks.thetvdb.com/banners/images/missing/series.jpg`;
    const posterUrl = type === 'movie' ? await Utils.getMoviePoster({ tmdbId: allIds?.tmdbId, tvdbId: tvdbId, imdbId: null, metaProvider: 'tvdb', fallbackPosterUrl: fallbackPosterUrl }, config) : await Utils.getSeriesPoster({ tmdbId: null, tvdbId: tvdbId, imdbId: null, metaProvider: 'tvdb', fallbackPosterUrl: fallbackPosterUrl }, config);
    const posterProxyUrl = `${host}/poster/${type}/${type === 'movie' && allIds?.tmdbId ? `tmdb:${allIds?.tmdbId}` : `tvdb:${tvdbId}`}?fallback=${encodeURIComponent(posterUrl)}&lang=${language}&key=${config.apiKeys?.rpdb}`;
    // Always use IMDb ID as primary, generate fallback if no IMDb ID available
    const primaryId = allIds?.imdbId || generateFallbackImdbId('tvdb', tvdbId);
    return {
      id: primaryId, // Use IMDb ID as primary, fallback to generated tt ID
      imdb_id: allIds?.imdbId || null,
      type: type,
      name: item.name,
      description: item.overview,
      poster: posterProxyUrl,
      logo: type === 'movie' ? await moviedb.getTmdbMovieLogo(allIds?.tmdbId, config) : await moviedb.getTmdbSeriesLogo(allIds?.tmdbId, config),
      year: item.year || null,
      runtime: Utils.parseRunTime(item.runtime),
      releaseInfo: item.year || null,
    };
  }));

  const metas = allMetas.filter(Boolean); // Filter out null values (items without IMDb ID)
  return metas;
}

async function getTvdbCollectionsCatalog(type, id, page, language, config) {
  const langCode = language.split('-')[0];
  if (id === 'tvdb.collections') {
    // Cache the collections list for this specific page
    const collections = await cacheWrapTvdbApi(`collections-list:${page}`, () => tvdb.getCollectionsList(config, page));
    if (!collections || !collections.length) return [];
    
    console.log(`[getTvdbCollectionsCatalog] Page ${page}: fetched ${collections.length} collections from TVDB API`);
    
    // Fetch extended details and translations for each collection in parallel
    const metas = await Promise.all(collections.map(async col => {
      const extended = await cacheWrapTvdbApi(`collection-extended:${col.id}`, () => tvdb.getCollectionDetails(col.id, config));
      if (!extended) return null;
      // Try to get translation in user language, fallback to English, then fallback to default
      let translation = await tvdb.getCollectionTranslations(col.id, langCode, config);
      if (!translation || !translation.name) {
        translation = await tvdb.getCollectionTranslations(col.id, 'eng', config);
      }
      const name = translation && translation.name ? translation.name : extended.name;
      if (!name) return null;
      const overview = translation && translation.overview ? translation.overview : extended.overview;
      const poster = extended.image ? (extended.image.startsWith('http') ? extended.image : `${TVDB_IMAGE_BASE}${extended.image}`) : undefined;
      return {
        id: `tvdbc:${col.id}`,
        type: 'series',
        name,
        poster,
        description: overview,
        year: extended.year || null
      };
    }));
    return metas.filter(Boolean);
  }
  return [];
}

async function getTmdbAndMdbListCatalog(type, id, genre, page, language, config, userUUID) {
  // Define host locally to ensure it's available in all scopes
  const localHost = process.env.HOST_NAME 
    ? (process.env.HOST_NAME.startsWith('http')
        ? process.env.HOST_NAME
        : `https://${process.env.HOST_NAME}`)
    : 'http://localhost:1337';
  if (id.startsWith("mdblist.")) {
    console.log(`[getCatalog] Fetching MDBList catalog: ${id}, Genre: ${genre}, Page: ${page}`);
    const listId = id.split(".")[1];
    const results = await fetchMDBListItems(listId, config.apiKeys?.mdblist, language, page);
    return await parseMDBListItems(results, type, genre, language, config);
  }

  const genreList = await getGenreList('tmdb', language, type, config);
  const parameters = await buildParameters(type, language, page, id, genre, genreList, config);

  const fetchFunction = type === "movie" 
    ? () => moviedb.discoverMovie(parameters, config) 
    : () => moviedb.discoverTv(parameters, config);

  const res = await fetchFunction();
  
  // Pre-calculate common values to avoid repeated calculations
  const posterProvider = Utils.resolveArtProvider(type, 'poster', config);
  const backgroundProvider = Utils.resolveArtProvider(type, 'background', config);
  const logoProvider = Utils.resolveArtProvider(type, 'logo', config);
  const preferredProvider = type === 'movie' ? (config.providers?.movie || 'tmdb') : (config.providers?.series || 'tvdb');
  
  // Collect all unique non-meta providers
  const targetProviders = new Set();
  if (posterProvider !== preferredProvider && posterProvider !== 'tmdb' && posterProvider !== 'fanart') targetProviders.add(posterProvider);
  if (backgroundProvider !== preferredProvider && backgroundProvider !== 'tmdb' && backgroundProvider !== 'fanart') targetProviders.add(backgroundProvider);
  if (logoProvider !== preferredProvider && logoProvider !== 'tmdb' && logoProvider !== 'fanart') targetProviders.add(logoProvider);
  if (preferredProvider !== 'tmdb') targetProviders.add(preferredProvider);
  if ((posterProvider === 'fanart' || backgroundProvider === 'fanart' || logoProvider === 'fanart') && type === 'series') targetProviders.add('tvdb');
  
  // Batch process items for better performance
  const batchSize = 5; // Process 5 items at a time to avoid overwhelming APIs
  const allMetas = [];
  
  for (let i = 0; i < res.results.length; i += batchSize) {
    const batch = res.results.slice(i, i + batchSize);
    const batchPromises = batch.map(async item => {
      try {
        // Resolve IDs for each individual item
        let allIds;
        if (targetProviders.size > 0) {
          const targetProviderArray = Array.from(targetProviders);
          allIds = await resolveAllIds(`tmdb:${item.id}`, type, config, null, targetProviderArray);
        }
        
        // Get logo and item details in parallel
        const [tmdbLogoUrl, itemDetails] = await Promise.all([
          type === 'movie' ? moviedb.getTmdbMovieLogo(item.id, config) : moviedb.getTmdbSeriesLogo(item.id, config),
          type === 'movie' ? moviedb.movieInfo({ id: item.id, language, append_to_response: "external_ids" }, config) : moviedb.tvInfo({ id: item.id, language, append_to_response: "external_ids" }, config)
        ]);

        // Always use IMDb ID as primary, generate fallback if no IMDb ID available
        let stremioId;
        const tmdbImdbId = itemDetails?.imdb_id || itemDetails?.external_ids?.imdb_id || allIds?.imdbId;
        if (tmdbImdbId) {
          stremioId = tmdbImdbId; // Use real IMDb ID if available
        } else {
          // Try to resolve IDs using ID resolver to get real IMDb ID
          try {
            const { resolveAllIds } = require('./id-resolver');
            const resolvedIds = await resolveAllIds(`tmdb:${item.id}`, type, config, null, ['imdb']);
            if (resolvedIds?.imdbId) {
              stremioId = resolvedIds.imdbId;
            } else {
              // Generate fallback tt ID based on TMDB ID
              stremioId = generateFallbackImdbId('tmdb', item.id);
            }
          } catch (error) {
            console.warn(`[Catalog] Failed to resolve IMDb ID for TMDB ${item.id}:`, error.message);
            // Generate fallback tt ID based on TMDB ID
            stremioId = generateFallbackImdbId('tmdb', item.id);
          }
        }

        // Poster and background with art provider logic
        const tmdbPosterFullUrl = item.poster_path
          ? `https://image.tmdb.org/t/p/w600_and_h900_bestv2${item.poster_path}`
          : `https://artworks.thetvdb.com/banners/images/missing/series.jpg`;
        const tmdbBackgroundFullUrl = item.backdrop_path
          ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` 
          : undefined;
        let posterUrl = tmdbPosterFullUrl;
        let backgroundUrl = tmdbBackgroundFullUrl;
        if(allIds) {
          if (type === 'movie') {
            posterUrl = await Utils.getMoviePoster({
              tmdbId: allIds.tmdbId,
              tvdbId: allIds.tvdbId,
              imdbId: allIds.imdbId,
              metaProvider: preferredProvider,
              fallbackPosterUrl: tmdbPosterFullUrl
            }, config);
            backgroundUrl = await Utils.getMovieBackground({
              tmdbId: allIds.tmdbId,
              tvdbId: allIds.tvdbId,
              imdbId: allIds.imdbId,
              metaProvider: preferredProvider,
              fallbackBackgroundUrl: tmdbBackgroundFullUrl
            }, config);
          } else {
            posterUrl = await Utils.getSeriesPoster({
              tmdbId: allIds.tmdbId,
              tvdbId: allIds.tvdbId,
              imdbId: allIds.imdbId,
              metaProvider: preferredProvider,
              fallbackPosterUrl: tmdbPosterFullUrl
            }, config);
            backgroundUrl = await Utils.getSeriesBackground({
              tmdbId: allIds.tmdbId,
              tvdbId: allIds.tvdbId,
              imdbId: allIds.imdbId,
              metaProvider: preferredProvider,
                fallbackBackgroundUrl: tmdbBackgroundFullUrl
              }, config);
          }
        }
        
        // Now we can safely use itemDetails
        const runtime = type === 'movie' ? itemDetails?.runtime || null : itemDetails?.episode_run_time?.[0] ?? itemDetails?.last_episode_to_air?.runtime ?? itemDetails?.next_episode_to_air?.runtime ?? null;
        const catalogImdbId = itemDetails.imdb_id || itemDetails.external_ids.imdb_id || allIds?.imdbId;
        // Always use IMDb ID as primary, generate fallback if no IMDb ID available
        const primaryId = catalogImdbId || generateFallbackImdbId('tmdb', item.id);
        const posterProxyUrl = `${localHost}/poster/${type}/${primaryId}?fallback=${encodeURIComponent(posterUrl)}&lang=${language}&key=${config.apiKeys?.rpdb}`;
        // Use TMDB rating as fallback to avoid additional API calls
        const imdbRating = item.vote_average?.toFixed(1) || "N/A";
        return {
          id: primaryId, // Use IMDb ID as primary, fallback to generated tt ID
          type: type,
          imdb_id: catalogImdbId,
          logo: tmdbLogoUrl,
          releaseInfo: (item.release_date || item.first_air_date || '').substring(0, 4),
          name: item.title || item.name,
          poster: posterProxyUrl,
          year: (item.release_date || item.first_air_date || '').substring(0, 4),
          background: backgroundUrl,
          description: item.overview,
          runtime: Utils.parseRunTime(runtime),
          genres: item.genre_ids.map(g => genreList.find(genre => genre.id === g)?.name),
          imdbRating: imdbRating,
        };
      } catch (error) {
        console.warn(`[getCatalog] Error processing item ${item.id}:`, error.message);
        return null; // Return null for failed items
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    allMetas.push(...batchResults.filter(Boolean)); // Filter out null values
  }

  return allMetas;
}

async function buildParameters(type, language, page, id, genre, genreList, config) {
  const languages = await getLanguages(config);
  const parameters = { language, page};

  if (id === 'tmdb.top' && type === 'series') {
    console.log('[TMDB Filter] Applying genre exclusion for popular series catalog.');

    const excludedGenreIds = [
      '10767', // Talk
      '10763', // News
      '10768', // War & Politics
    ];
    
    parameters.without_genres = excludedGenreIds.join(',');
    
    console.log(`[TMDB Filter] Excluding genre IDs: ${parameters.without_genres}`);
  }

  if (config.ageRating) {
    switch (config.ageRating) {
      case "G":
        parameters.certification_country = "US";
        parameters.certification = type === "movie" ? "G" : "TV-G";
        break;
      case "PG":
        parameters.certification_country = "US";
        parameters.certification = type === "movie" ? ["G", "PG"].join("|") : ["TV-G", "TV-PG"].join("|");
        break;
      case "PG-13":
        parameters.certification_country = "US";
        parameters.certification = type === "movie" ? ["G", "PG", "PG-13"].join("|") : ["TV-G", "TV-PG", "TV-14"].join("|");
        break;
      case "R":
        parameters.certification_country = "US";
        parameters.certification = type === "movie" ? ["G", "PG", "PG-13", "R"].join("|") : ["TV-G", "TV-PG", "TV-14", "TV-MA"].join("|");
        break;
      case "NC-17":
        break;
    }
  }

  if (id.includes("streaming")) {
    const provider = findProvider(id.split(".")[1]);
    console.log(`[getCatalog] Found provider: ${JSON.stringify(provider)}`);

    parameters.with_genres = genre ? findGenreId(genre, genreList) : undefined;
    parameters.with_watch_providers = provider.watchProviderId
    parameters.watch_region = provider.country;
    parameters.with_watch_monetization_types = "flatrate|free|ads";
  } else {
    switch (id) {
      case "tmdb.top":
        parameters.sort_by = 'popularity.desc'
        parameters.with_genres = genre ? findGenreId(genre, genreList) : undefined;
        if (type === "series") {
          parameters.watch_region = language.split("-")[1];
          parameters.with_watch_monetization_types = "flatrate|free|ads|rent|buy";
        }
        break;
      case "tmdb.year":
        const year = genre ? genre : new Date().getFullYear();
        parameters[type === "movie" ? "primary_release_year" : "first_air_date_year"] = year;
        break;
      case "tmdb.language":
        const findGenre = genre ? findLanguageCode(genre, languages) : language.split("-")[0];
        parameters.with_original_language = findGenre;
        break;
      default:
        break;
    }
  }
  return parameters;
}

function findGenreId(genreName, genreList) {
  const genreData = genreList.find(genre => genre.name === genreName);
  return genreData ? genreData.id : undefined;
}

function findLanguageCode(genre, languages) {
  const language = languages.find((lang) => lang.name === genre);
  return language ? language.iso_639_1.split("-")[0] : "";
}

function findProvider(providerId) {
  const provider = CATALOG_TYPES.streaming[providerId];
  if (!provider) throw new Error(`Could not find provider: ${providerId}`);
  return provider;
}

/**
 * Handles StremThru catalog requests
 * @param {string} type - Content type ('movie' or 'series')
 * @param {string} catalogId - The StremThru catalog ID
 * @param {string} genre - Optional genre filter
 * @param {number} page - Page number
 * @param {string} language - Language code
 * @param {Object} config - Addon configuration
 * @param {string} userUUID - User UUID
 * @returns {Promise<Array>} Array of meta items
 */
async function getStremThruCatalog(type, catalogId, genre, page, language, config, userUUID) {
  try {
    console.log(`[✨ StremThru] Processing catalog request: ${catalogId}, type: ${type}, genre: ${genre || 'none'}, page: ${page}`);
    
    // Find the user catalog configuration to get the source URL
    const userCatalog = config.catalogs?.find(c => c.id === catalogId);
    if (!userCatalog || (!userCatalog.sourceUrl && !userCatalog.source)) {
      console.error(`[✨ StremThru] No source URL found for catalog: ${catalogId}`);
      return [];
    }
    
    // Use sourceUrl for StremThru catalogs, fallback to source for backward compatibility
    const catalogUrl = userCatalog.sourceUrl || userCatalog.source;
    // sparkle emoji
    console.log(`[✨ StremThru] Using catalog URL: ${catalogUrl}`);
    
    // Fetch catalog items from StremThru with proper pagination
    const items = await fetchStremThruCatalog(catalogUrl);
    if (!items || items.length === 0) {
      console.warn(`[StremThru] No items returned from catalog: ${catalogUrl} (page: ${page})`);
      return [];
    }

    // Apply client-side pagination
    const pageSize = 20;
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedItems = items.slice(startIndex, endIndex);
    
    // Parse items into Stremio format
    const metas = await parseStremThruItems(paginatedItems, type, genre, language, config);
    
    console.log(`[StremThru] Successfully processed ${metas.length} items for catalog: ${catalogId} (page: ${page})`);
    return metas;
    
  } catch (error) {
    console.error(`[StremThru] Error processing catalog ${catalogId}:`, error.message);
    return [];
  }
}

/**
 * Handles IMDb catalog requests
 * @param {string} type - Content type ('movie' or 'series')
 * @param {string} catalogId - The IMDb catalog ID
 * @param {string} genre - Optional genre filter  
 * @param {number} page - Page number
 * @param {string} language - Language code
 * @param {Object} config - Addon configuration
 * @param {string} userUUID - User UUID
 * @returns {Promise<Array>} Array of meta items
 */
async function getImdbCatalog(type, catalogId, genre, page, language, config, userUUID) {
  try {
    console.log(`[IMDb] Processing catalog request: ${catalogId}, type: ${type}, genre: ${genre || 'none'}, page: ${page}`);
    
    const [provider, catalogType] = catalogId.split('.');
    
    // IMDb catalog types from catalog-types.json
    const validCatalogTypes = ['top250', 'popular', 'bottom100', 'top_english'];
    
    if (!validCatalogTypes.includes(catalogType)) {
      console.warn(`[IMDb] Unknown catalog type: ${catalogType}. Valid types: ${validCatalogTypes.join(', ')}`);
      return [];
    }
    
    console.log(`[IMDb] Fetching IMDb ${catalogType} catalog for ${type}`);
    
    // Use TMDB as the source for IMDb-style catalogs since IMDb doesn't have a public API
    // We'll filter and transform the results to use IMDb IDs as primary identifiers
    const genreList = await getGenreList('tmdb', language, type, config);
    
    // Map IMDb catalog types to TMDB equivalents
    let tmdbCatalogType = catalogType;
    if (catalogType === 'top250') {
      tmdbCatalogType = 'top_rated';
    } else if (catalogType === 'bottom100') {
      tmdbCatalogType = 'popular'; // We'll sort by vote_average asc later
    } else if (catalogType === 'top_english') {
      tmdbCatalogType = 'popular'; // We'll filter by language later
    }
    
    const parameters = await buildParameters(type, language, page, `tmdb.${tmdbCatalogType}`, genre, genreList, config);
    
    const fetchFunction = type === "movie" 
      ? () => moviedb.discoverMovie(parameters, config) 
      : () => moviedb.discoverTv(parameters, config);
    
    const res = await fetchFunction();
    console.log(`[IMDb] Retrieved ${res.results.length} items from TMDB for IMDb catalog`);
    
    const allMetas = await Promise.all(res.results.map(async item => {
      try {
        // Get detailed info including external IDs
        const itemDetails = type === 'movie' 
          ? await moviedb.movieInfo({ id: item.id, language, append_to_response: "external_ids" }, config) 
          : await moviedb.tvInfo({ id: item.id, language, append_to_response: "external_ids" }, config);
        
        // Check if we have an IMDb ID
        if (!itemDetails.imdb_id) {
          console.log(`[IMDb] No IMDb ID found for TMDB ${type} ${item.id}, skipping`);
          return null;
        }
        
        // Resolve all IDs to get comprehensive metadata
        const allIds = await resolveAllIds(`imdb:${itemDetails.imdb_id}`, type, config);
        
        if (!allIds) {
          console.log(`[IMDb] Could not resolve IDs for IMDb ${itemDetails.imdb_id}, skipping`);
          return null;
        }
        
        // Use IMDb ID as the primary stremioId (with tt prefix)
        const stremioId = itemDetails.imdb_id;
        
        // Determine preferred meta provider
        let preferredProvider;
        if (type === 'movie') {
          preferredProvider = config.providers?.movie || 'tmdb';
        } else {
          preferredProvider = config.providers?.series || 'tvdb';
        }
        
        // Get artwork
        let posterUrl, backgroundUrl;
        if (type === 'movie') {
          posterUrl = await Utils.getMoviePoster({
            tmdbId: allIds.tmdbId,
            tvdbId: allIds.tvdbId,
            imdbId: allIds.imdbId,
            metaProvider: preferredProvider,
            fallbackPosterUrl: item.poster_path 
              ? `https://image.tmdb.org/t/p/w600_and_h900_bestv2${item.poster_path}`
              : `https://artworks.thetvdb.com/banners/images/missing/series.jpg`
          }, config);
          backgroundUrl = await Utils.getMovieBackground({
            tmdbId: allIds.tmdbId,
            tvdbId: allIds.tvdbId,
            imdbId: allIds.imdbId,
            metaProvider: preferredProvider,
            fallbackBackgroundUrl: item.backdrop_path 
              ? `https://image.tmdb.org/t/p/original${item.backdrop_path}`
              : undefined
          }, config);
        } else {
          posterUrl = await Utils.getSeriesPoster({
            tmdbId: allIds.tmdbId,
            tvdbId: allIds.tvdbId,
            imdbId: allIds.imdbId,
            metaProvider: preferredProvider,
            fallbackPosterUrl: item.poster_path 
              ? `https://image.tmdb.org/t/p/w600_and_h900_bestv2${item.poster_path}`
              : `https://artworks.thetvdb.com/banners/images/missing/series.jpg`
          }, config);
          backgroundUrl = await Utils.getSeriesBackground({
            tmdbId: allIds.tmdbId,
            tvdbId: allIds.tvdbId,
            imdbId: allIds.imdbId,
            metaProvider: preferredProvider,
            fallbackBackgroundUrl: item.backdrop_path 
              ? `https://image.tmdb.org/t/p/original${item.backdrop_path}`
              : undefined
          }, config);
        }
        
        // Build the meta object
        const meta = {
          id: stremioId,
          type: type,
          name: item.title || item.name,
          genres: item.genre_ids ? item.genre_ids.map(id => {
            const genre = genreList.find(g => g.id === id);
            return genre ? genre.name : 'Unknown';
          }).filter(Boolean) : [],
          poster: posterUrl,
          background: backgroundUrl,
          logo: type === 'movie' 
            ? await moviedb.getTmdbMovieLogo(item.id, config)
            : await moviedb.getTmdbSeriesLogo(item.id, config),
          imdb_id: itemDetails.imdb_id,
          imdbRating: await getImdbRating(itemDetails.imdb_id, type),
          year: type === 'movie' 
            ? new Date(item.release_date).getFullYear()
            : new Date(item.first_air_date).getFullYear(),
          description: item.overview || '',
          runtime: type === 'movie' ? itemDetails.runtime : undefined,
          status: type === 'series' ? itemDetails.status : undefined,
          network: type === 'series' && itemDetails.networks ? itemDetails.networks.map(n => n.name).join(', ') : undefined,
          country: itemDetails.production_countries ? itemDetails.production_countries.map(c => c.name).join(', ') : undefined,
          language: itemDetails.original_language || language.split('-')[0],
          popularity: item.popularity,
          vote_average: item.vote_average,
          vote_count: item.vote_count
        };
        
        console.log(`[IMDb] Created meta for ${stremioId}: ${meta.name}`);
        return meta;
        
      } catch (error) {
        console.error(`[IMDb] Error processing item ${item.id}:`, error.message);
        return null;
      }
    }));
    
    // Filter out null results
    let validMetas = allMetas.filter(meta => meta !== null);
    
    // Apply IMDb-specific filtering and sorting
    if (catalogType === 'bottom100') {
      // Sort by vote_average ascending (worst rated first)
      validMetas = validMetas
        .filter(meta => meta.vote_average > 0) // Only include items with ratings
        .sort((a, b) => a.vote_average - b.vote_average)
        .slice(0, 100); // Limit to bottom 100
    } else if (catalogType === 'top250') {
      // Sort by vote_average descending (best rated first)
      validMetas = validMetas
        .filter(meta => meta.vote_average > 0) // Only include items with ratings
        .sort((a, b) => b.vote_average - a.vote_average)
        .slice(0, 250); // Limit to top 250
    } else if (catalogType === 'top_english') {
      // Filter by English language
      validMetas = validMetas.filter(meta => 
        meta.language === 'en' || 
        meta.language === 'english' ||
        meta.country?.toLowerCase().includes('united states') ||
        meta.country?.toLowerCase().includes('united kingdom') ||
        meta.country?.toLowerCase().includes('canada') ||
        meta.country?.toLowerCase().includes('australia')
      );
    }
    
    console.log(`[IMDb] Successfully processed ${validMetas.length} items for IMDb ${catalogType} catalog`);
    
    return validMetas;
    
  } catch (error) {
    console.error(`[IMDb] Error processing catalog ${catalogId}:`, error.message);
    return [];
  }
}

module.exports = { getCatalog };
