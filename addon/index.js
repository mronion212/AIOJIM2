const express = require("express");
const favicon = require('serve-favicon');
const path = require("path");
const addon = express();
const analytics = require('./utils/analytics');
const { getCatalog } = require("./lib/getCatalog");
const { getSearch } = require("./lib/getSearch");
const { getManifest, DEFAULT_LANGUAGE } = require("./lib/getManifest");
const { getMeta } = require("./lib/getMeta");
const { cacheWrapMeta, cacheWrapCatalog, cacheWrapJikanApi, cacheWrapStaticCatalog } = require("./lib/getCache");
const { getTrending } = require("./lib/getTrending");
const { parseConfig, getRpdbPoster, checkIfExists, parseAnimeCatalogMeta } = require("./utils/parseProps");
const { getRequestToken, getSessionId } = require("./lib/getSession");
const { getFavorites, getWatchList } = require("./lib/getPersonalLists");
const { blurImage } = require('./utils/imageProcessor');
const axios = require('axios');
const jikan = require('./lib/mal');

addon.use(analytics.middleware);


const getCacheHeaders = function (opts) {
  opts = opts || {};
  if (!Object.keys(opts).length) return false;
  let cacheHeaders = {
    cacheMaxAge: "max-age",
    staleRevalidate: "stale-while-revalidate",
    staleError: "stale-if-error",
  };
  return Object.keys(cacheHeaders)
    .map((prop) => {
      const value = opts[prop];
      if (!value) return false;
      return cacheHeaders[prop] + "=" + value;
    })
    .filter((val) => !!val)
    .join(", ");
};

const respond = function (res, data, opts) {
  const cacheControl = getCacheHeaders(opts);
  if (cacheControl) res.setHeader("Cache-Control", `${cacheControl}, public`);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Content-Type", "application/json");
  res.send(data);
};

// --- Static, Auth, and Configuration Routes ---
addon.get("/", function (_, res) { res.redirect("/configure"); });
addon.get("/request_token", async function (req, res) { const r = await getRequestToken(); respond(res, r); });
addon.get("/session_id", async function (req, res) { const s = await getSessionId(req.query.request_token); respond(res, s); });

// --- Manifest Route (with caching) ---
addon.get("/:catalogChoices?/manifest.json", async function (req, res) {
    const { catalogChoices } = req.params;
    const config = parseConfig(catalogChoices) || {};
    const manifest = await getManifest(config);
    const cacheOpts = { cacheMaxAge: 12 * 60 * 60, staleRevalidate: 14 * 24 * 60 * 60, staleError: 30 * 24 * 60 * 60 };
    respond(res, manifest, cacheOpts);
});

// --- Catalog & Search Route (with caching) ---
addon.get("/:catalogChoices?/catalog/:type/:id/:extra?.json", async function (req, res) {
  const { catalogChoices, type, id, extra } = req.params;
  const config = parseConfig(catalogChoices) || {};
  const language = config.language || DEFAULT_LANGUAGE;
  const sessionId = config.sessionId;

  const isStaticCatalog = ['mal.decade80s', 'mal.decade90s', 'mal.decade00s', 'mal.decade10s'].includes(id);
  const cacheWrapper = isStaticCatalog ? cacheWrapStaticCatalog : cacheWrapCatalog;

  const cacheKey = `${id}:${type}:${JSON.stringify(extra || {})}:${JSON.stringify(config.ageRating || 'any')}`;

  try {
    const responseData = await cacheWrapper(cacheKey, async () => {
      let metas = []; 
      
      if (id.includes('search')) {
        const extraArgs = extra ? Object.fromEntries(new URLSearchParams(extra)) : {};
        const searchResult = await getSearch(id, type, language, extraArgs, config);
        metas = searchResult.metas || [];
      } else {
        const { genre: genreName, skip } = extra ? Object.fromEntries(new URLSearchParams(extra)) : {};
        const page = skip ? Math.ceil(parseInt(skip) / 20 + 1) : 1;
        const args = [type, language, page];
        switch (id) {
          // --- Dynamic Catalogs (will use 1-hour cache) ---
          case "tmdb.trending":
            metas = (await getTrending(...args, genreName, config, catalogChoices)).metas;
            break;
          case "tmdb.favorites":
            metas = (await getFavorites(...args, genreName, sessionId)).metas;
            break;
          case "tmdb.watchlist":
            metas = (await getWatchList(...args, genreName, sessionId)).metas;
            break;
          case 'mal.airing':
          case 'mal.upcoming':
          case 'mal.decade20s': {
            const pageSize = 50;
            const animeResults = id === 'mal.airing'
              ? await jikan.getAiringNow(pageSize, config)
              : id === 'mal.upcoming'
                ? await jikan.getUpcoming(pageSize, config)
                : await jikan.getTopAnimeByDateRange('2020-01-01', '2029-12-31', pageSize, config);
            metas = animeResults.map(anime => parseAnimeCatalogMeta(anime, config, language)).filter(Boolean);
            break;
          }
          case 'mal.genres': {
            const mediaType = 'series';
            if (genreName) {
               const allAnimeGenres = await cacheWrapJikanApi('anime-genres', async () => {
                console.log('[Cache Miss] Fetching fresh anime genre list from Jikan...');
                return await jikan.getAnimeGenres();
               });
              const selectedGenre = allAnimeGenres.find(g => g.name === genreName);
              if (selectedGenre) {
                const genreId = selectedGenre.mal_id;
                const animeResults = await jikan.getAnimeByGenre(genreId, mediaType, 50, config);
                metas = animeResults.map(anime => parseAnimeCatalogMeta(anime, config, language)).filter(Boolean);
              }
            }
            break;
          }

          case 'mal.decade80s':
          case 'mal.decade90s':
          case 'mal.decade00s':
          case 'mal.decade10s':
            const decadeMap = {
              'mal.decade80s': ['1980-01-01', '1989-12-31'],
              'mal.decade90s': ['1990-01-01', '1999-12-31'],
              'mal.decade00s': ['2000-01-01', '2009-12-31'],
              'mal.decade10s': ['2010-01-01', '2019-12-31'],
            };
            const [startDate, endDate] = decadeMap[id];
            const animeResults = await jikan.getTopAnimeByDateRange(startDate, endDate, 50, config);
            metas = animeResults.map(anime => parseAnimeCatalogMeta(anime, config, language)).filter(Boolean);
            break;
          
          default:
            metas = (await getCatalog(type, language, page, id, genreName, config, catalogChoices)).metas;
            break;
        }
      }
      return { metas: metas || [] };
    });
    const httpCacheOpts = isStaticCatalog 
        ? { cacheMaxAge: 24 * 60 * 60 }
        : { cacheMaxAge: 1 * 60 * 60 }; 
    respond(res, responseData, httpCacheOpts);

  } catch (e) {
    console.error(`Error in catalog route for id "${id}" and type "${type}":`, e);
    return res.status(500).send("Internal Server Error");
  }
});

// --- Meta Route (with Redis and HTTP caching) ---
addon.get("/:catalogChoices?/meta/:type/:id.json", async function (req, res) {
  const { catalogChoices, type, id: stremioId } = req.params;
  const config = parseConfig(catalogChoices) || {};
  const language = config.language || DEFAULT_LANGUAGE;
  const fullConfig = { ...config, rpdbkey: config.rpdbkey, hideEpisodeThumbnails: config.hideEpisodeThumbnails === "true" };

  try {
    const result = await cacheWrapMeta(stremioId, async () => {
      return await getMeta(type, language, stremioId, fullConfig, catalogChoices);
    });

    if (!result || !result.meta) {
      return respond(res, { meta: null });
    }
    
    const cacheOpts = { staleRevalidate: 20 * 24 * 60 * 60, staleError: 30 * 24 * 60 * 60 };
    if (type === "movie") {
      cacheOpts.cacheMaxAge = 14 * 24 * 60 * 60; // 14 days
    } else if (type === "series") {
      const hasEnded = result.meta.status === 'Ended';
      cacheOpts.cacheMaxAge = (hasEnded ? 7 : 1) * 24 * 60 * 60; // 7 days for ended, 1 day for running
    }
    
    respond(res, result, cacheOpts);
    
  } catch (error) {
    console.error(`CRITICAL ERROR in meta route for ${stremioId}:`, error);
    res.status(500).send("Internal Server Error");
  }
});


addon.get("/poster/:type/:id", async function (req, res) {
  const { type, id } = req.params;
  const { fallback, lang, key } = req.query;
  console.log("poster hit, yaay");
  if (!key) {
    return res.redirect(302, fallback);
  }

  const [idSource, idValue] = id.split(':');
  const ids = {
    tmdbId: idSource === 'tmdb' ? idValue : null,
    tvdbId: idSource === 'tvdb' ? idValue : null
  };

  try {
    const rpdbUrl = getRpdbPoster(type, ids, lang, key);

    if (rpdbUrl && await checkIfExists(rpdbUrl)) {
      console.log("Success! Pipe the image from RPDB directly to the user.");
      const imageResponse = await axios({
        method: 'get',
        url: rpdbUrl,
        responseType: 'stream'
      });
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
      imageResponse.data.pipe(res);
    } else {
      res.redirect(302, fallback);
    }
  } catch (error) {
    console.error(`Error in poster proxy for ${id}:`, error.message);
    res.redirect(302, fallback);
  }
});


// --- Image Blur Route ---
addon.get("/api/image/blur", async function (req, res) {
  const imageUrl = req.query.url;
  if (!imageUrl) { return res.status(400).send('Image URL not provided'); }
  try {
    const blurredImageBuffer = await blurImage(imageUrl);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(blurredImageBuffer);
  } catch (error) {
    console.error('Error in blur route:', error);
    res.status(500).send('Error processing image');
  }
});

addon.use(favicon(path.join(__dirname, '../public/favicon.png')));
addon.use('/configure', express.static(path.join(__dirname, '../dist')));
addon.get('/:catalogChoices?/configure', function (req, res) {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
});

addon.use(express.static(path.join(__dirname, '../public')));
addon.use(express.static(path.join(__dirname, '../dist')));

module.exports = addon;
