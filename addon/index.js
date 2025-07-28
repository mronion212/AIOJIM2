const express = require("express");
const favicon = require('serve-favicon');
const path = require("path");
const addon = express();
const analytics = require('./utils/analytics');
const { getCatalog } = require("./lib/getCatalog");
const { getSearch } = require("./lib/getSearch");
const { getManifest, DEFAULT_LANGUAGE } = require("./lib/getManifest");
const { getMeta } = require("./lib/getMeta");
const { cacheWrapMeta, cacheWrapCatalog } = require("./lib/getCache");
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
  
  try {
    let metas;
    if (id.includes('search')) {
      const extraArgs = extra ? Object.fromEntries(new URLSearchParams(extra)) : {};
      
      metas = await getSearch(id, type, language, extraArgs, config);

    } else {
      const { genre: genreName, skip } = extra ? Object.fromEntries(new URLSearchParams(extra)) : {};
      const page = skip ? Math.ceil(parseInt(skip) / 20 + 1) : 1;
      const args = [type, language, page];

      switch (id) {
        case "tmdb.trending":
          metas = (await getTrending(...args, genreName, config, catalogChoices)).metas;
          break;
        case "tmdb.favorites":
          metas = (await getFavorites(...args, genreName, config.sessionId)).metas;
          break;
        case "tmdb.watchlist":
          metas = (await getWatchList(...args, genreName, config.sessionId)).metas;
          break;

        case 'mal.genres': {
          const mediaType = 'series';

          if (genreName) {
            const allAnimeGenres = await jikan.getAnimeGenres();
            const selectedGenre = allAnimeGenres.find(g => g.name === genreName);

            if (selectedGenre) {
              const genreId = selectedGenre.mal_id;
              const animeResults = await jikan.getAnimeByGenre(genreId, mediaType, 50, config);
              metas = animeResults.map(anime => 
                parseAnimeCatalogMeta(anime, config, language)
              ).filter(Boolean);
            }
          }
          break;
        }

        default:
          metas = (await getCatalog(...args, id, genreName, config, catalogChoices)).metas;
          break;
      }
    }
    
    const responseData = metas.metas ? metas : { metas };
    
    const cacheOpts = { cacheMaxAge: 1 * 60 * 60 };
    respond(res, responseData, cacheOpts);

  } catch (e) {
    console.error(e);
    return res.status(404).send((e || {}).message || "Not found");
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
