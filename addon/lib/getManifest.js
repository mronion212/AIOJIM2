require("dotenv").config();
const { getGenreList } = require("./getGenreList");
const { getLanguages } = require("./getLanguages");
const { getGenresFromMDBList } = require("../utils/mdbList");
const packageJson = require("../../package.json");
const catalogsTranslations = require("../static/translations.json");
const CATALOG_TYPES = require("../static/catalog-types.json");
const jikan = require('./mal');
const DEFAULT_LANGUAGE = "en-US";
const { cacheWrapJikanApi } = require('./getCache');

const host = process.env.HOST_NAME.startsWith('http')
    ? process.env.HOST_NAME
    : `https://${process.env.HOST_NAME}`;

function generateArrayOfYears(maxYears) {
  const max = new Date().getFullYear();
  const min = max - maxYears;
  const years = [];
  for (let i = max; i >= min; i--) {
    years.push(i.toString());
  }
  return years;
}

function setOrderLanguage(language, languagesArray) {
  const languageObj = languagesArray.find((lang) => lang.iso_639_1 === language);
  const fromIndex = languagesArray.indexOf(languageObj);
  const element = languagesArray.splice(fromIndex, 1)[0];
  languagesArray = languagesArray.sort((a, b) => (a.name > b.name ? 1 : -1));
  languagesArray.splice(0, 0, element);
  return [...new Set(languagesArray.map((el) => el.name))];
}

function loadTranslations(language) {
  const defaultTranslations = catalogsTranslations[DEFAULT_LANGUAGE] || {};
  const selectedTranslations = catalogsTranslations[language] || {};

  return { ...defaultTranslations, ...selectedTranslations };
}

function createCatalog(id, type, catalogDef, options, tmdbPrefix, translatedCatalogs, showInHome = false) {
  const extra = [];

  if (catalogDef.extraSupported.includes("genre")) {
    if (catalogDef.defaultOptions) {
      const formattedOptions = catalogDef.defaultOptions.map(option => {
        if (option.includes('.')) {
          const [field, order] = option.split('.');
          if (translatedCatalogs[field] && translatedCatalogs[order]) {
            return `${translatedCatalogs[field]} (${translatedCatalogs[order]})`;
          }
          return option;
        }
        return translatedCatalogs[option] || option;
      });
      extra.push({ name: "genre", options: formattedOptions, isRequired: showInHome ? false : true });
    } else {
      extra.push({ name: "genre", options, isRequired: showInHome ? false : true });
    }
  }
  if (catalogDef.extraSupported.includes("search")) {
    extra.push({ name: "search" });
  }
  if (catalogDef.extraSupported.includes("skip")) {
    extra.push({ name: "skip" });
  }

  return {
    id,
    type,
    name: `${tmdbPrefix ? "TMDB - " : ""}${translatedCatalogs[catalogDef.nameKey]}`,
    pageSize: 20,
    extra
  };
}

function getCatalogDefinition(catalogId) {
  const [provider, type] = catalogId.split('.');

  for (const category of Object.keys(CATALOG_TYPES)) {
    if (CATALOG_TYPES[category][type]) {
      return CATALOG_TYPES[category][type];
    }
  }

  return null;
}

function getOptionsForCatalog(catalogDef, type, showInHome, { years, genres_movie, genres_series, filterLanguages }) {
  if (catalogDef.defaultOptions) return catalogDef.defaultOptions;

  const movieGenres = showInHome ? [...genres_movie] : ["Top", ...genres_movie];
  const seriesGenres = showInHome ? [...genres_series] : ["Top", ...genres_series];

  switch (catalogDef.nameKey) {
    case 'year':
      return years;
    case 'language':
      return filterLanguages;
    case 'popular':
      return type === 'movie' ? movieGenres : seriesGenres;
    default:
      return type === 'movie' ? movieGenres : seriesGenres;
  }
}

async function createMDBListCatalog(userCatalog, mdblistKey) {
  const listId = userCatalog.id.split(".")[1];
  const genres = await getGenresFromMDBList(listId, mdblistKey);

  return {
    id: userCatalog.id,
    type: userCatalog.type,
    name: userCatalog.name,
    pageSize: 20,
    extra: [
      { name: "genre", options: genres, isRequired: userCatalog.showInHome ? false : true },
      { name: "skip" },
    ],
  };
}

async function getManifest(config) {
  const language = config.language || DEFAULT_LANGUAGE;
  const tmdbPrefix = config.tmdbPrefix === "true";
  const provideImdbId = config.provideImdbId === "true";
  const sessionId = config.sessionId;
  const userCatalogs = getDefaultCatalogs();
  const translatedCatalogs = loadTranslations(language);

  const stremioAddonsConfig = {
    issuer: "https://stremio-addons.net",
    signature: "eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..DTiTHmYyIbuTMPJB35cqsw.S2C6xuCL9OoHJbtX97v-2w3IM4iFqr2Qy4xRRlvyzIY2fZAcwmm6JUMdsc2LSTigIPQeGPomaqX53ECt23cJKuH-IKs4hHLH4sLYRZNL_VC0YefQNrWjMRZ75Yz-bVx3.DJZBtIb1bOCq6Z62AMUGvw"
  }

  const years = generateArrayOfYears(20);
  const genres_movie = await getGenreList(language, "movie").then(genres => {
    return genres.map(el => el.name).sort();
  });

  const genres_series = await getGenreList(language, "series").then(genres => {
    return genres.map(el => el.name).sort();
  });

  const languagesArray = await getLanguages();
  const filterLanguages = setOrderLanguage(language, languagesArray);
  const isMDBList = (id) => id.startsWith("mdblist.");
  const options = { years, genres_movie, genres_series, filterLanguages };

  let catalogs = await Promise.all(userCatalogs
    .filter(userCatalog => {
      const catalogDef = getCatalogDefinition(userCatalog.id);
      if (isMDBList(userCatalog.id)) return true;
      if (!catalogDef) return false;
      if (catalogDef.requiresAuth && !sessionId) return false;
      return true;
    })
    .map(async (userCatalog) => {
      if (isMDBList(userCatalog.id)) {
          return createMDBListCatalog(userCatalog, config.mdblistkey);
      }
      const catalogDef = getCatalogDefinition(userCatalog.id);
      let catalogOptions = [];

      if (userCatalog.id === 'mal.genres') {
          const animeGenres = await cacheWrapJikanApi('anime-genres', async () => {
            console.log('[Cache Miss] Fetching fresh anime genre list in manifest from Jikan...');
            return await jikan.getAnimeGenres();
          });
          catalogOptions = animeGenres.map(genre => genre.name).sort();
      } else {
          catalogOptions = getOptionsForCatalog(catalogDef, userCatalog.type, userCatalog.showInHome, options);
      }

      return createCatalog(
          userCatalog.id,
          userCatalog.type,
          catalogDef,
          catalogOptions,
          tmdbPrefix,
          translatedCatalogs,
          userCatalog.showInHome
      );   
    }));
  
  catalogs = catalogs.filter(Boolean);

  if (config.searchEnabled !== "false") {
    const searchCatalogMovie = {
      id: "tmdb.search",
      type: "movie",
      name: `${tmdbPrefix ? "TMDB - " : ""}${translatedCatalogs.search}`,
      extra: [{ name: "search", isRequired: true, options: [] }]
    };

    const searchCatalogSeries = {
      id: "tvdb.search",
      type: "series",
      name: `${tmdbPrefix ? "TVDB - " : ""}${translatedCatalogs.search}`,
      extra: [{ name: "search", isRequired: true, options: [] }]
    };
  
    const searchCatalogAnime = {
        id: "mal.search",
        type: "anime",
        name: "Anime Search (MAL)",
        extra: [{ name: "search", isRequired: true, options: [] }]
    };

    const searchVAAnime = {
      id: "mal.va_search",
      type: "anime",
      name: "Voice Actor Roles",
      extra: [{ name: "va_id", isRequired: true }]
    };

    const searchGenreAnime = {
      id: "mal.genre_search", 
      type: "anime",
      name: "Anime Genre", 
      extra: [{ name: "genre_id", isRequired: true }]
    }

    catalogs = [...catalogs, searchCatalogMovie, searchCatalogSeries, searchCatalogAnime, searchVAAnime, searchGenreAnime];
  }

  if (config.geminikey) {
    const aiSearchCatalogMovie = {
      id: "gemini.search", 
      type: "movie",
      name: "AI Search",
      extra: [{ name: "search", isRequired: true }]
    };

    const aiSearchCatalogSeries = {
      id: "gemini.search",
      type: "series",
      name: "AI Search",
      extra: [{ name: "search", isRequired: true }]
    };
    
    const aiSearchCatalogAnime = {
      id: "gemini.search",
      type: "anime",
      name: "AI Search",
      extra: [{ name: "search", isRequired: true }]
    };

    catalogs = [...catalogs, aiSearchCatalogMovie, aiSearchCatalogSeries, aiSearchCatalogAnime];
  }

  const activeConfigs = [
    `Language: ${language}`,
    `TMDB Account: ${sessionId ? 'Connected' : 'Not Connected'}`,
    `MDBList Integration: ${config.mdblistkey ? 'Connected' : 'Not Connected'}`,
    `IMDb Integration: ${provideImdbId ? 'Enabled' : 'Disabled'}`,
    `RPDB Integration: ${config.rpdbkey ? 'Enabled' : 'Disabled'}`,
    `Search: ${config.searchEnabled !== "false" ? 'Enabled' : 'Disabled'}`,
    `Active Catalogs: ${catalogs.length}`
  ].join(' | ');
  

  return {
    id: packageJson.name,
    version: packageJson.version,
    favicon: `${host}/favicon.png`,
    logo: `${host}/logo.png`,
    background: `${host}/background.png`,
    name: "The Movie Database Addon",
    description: "A powerful hybrid metadata addon for Stremio. It uses TMDB for movies and discovery, and TVDB for superior TV show metadata, ensuring the most accurate and up-to-date information.",
    resources: ["catalog", "meta"],
    types: ["movie", "series", "anime"],
    idPrefixes: ["tmdb:", "tt", "tvdb:", "mal:"],
    stremioAddonsConfig,
    behaviorHints: {
      configurable: true,
      configurationRequired: false,
    },
    catalogs,
  };
}

function getDefaultCatalogs() {
  const defaultTypes = ['movie', 'series'];
  const defaultTmdbCatalogs = Object.keys(CATALOG_TYPES.default);

  const tmdbCatalogs = defaultTmdbCatalogs.flatMap(id =>
    defaultTypes.map(type => ({
      id: `tmdb.${id}`,
      type,
      showInHome: true 
    }))
  );

  const animeCatalogs = [
    {
      id: 'mal.airing',
      type: 'anime',
      showInHome: true 
    },
    {
      id: 'mal.upcoming',
      type: 'anime',
      showInHome: true 
    },
    {
      id: 'mal.genres',
      name: 'MAL Genres',
      type: 'anime',
      showInHome: false 
    },
    { id: 'mal.decade80s', type: 'anime', showInHome: true },
    { id: 'mal.decade90s', type: 'anime', showInHome: true },
    { id: 'mal.decade00s', type: 'anime', showInHome: true },
    { id: 'mal.decade10s', type: 'anime', showInHome: true },
    { id: 'mal.decade20s', type: 'anime', showInHome: true },
  ];

  return [...tmdbCatalogs, ...animeCatalogs];
}

module.exports = { getManifest, DEFAULT_LANGUAGE };
