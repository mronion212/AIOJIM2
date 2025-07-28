require("dotenv").config();
const { MovieDb } = require("moviedb-promise");
const { getGenreList } = require("./getGenreList");
const { getLanguages } = require("./getLanguages");
const { fetchMDBListItems, parseMDBListItems } = require("../utils/mdbList");
const CATALOG_TYPES = require("../static/catalog-types.json");
const { getMeta } = require("./getMeta");
const { isAnime } = require("../utils/isAnime");
const moviedb = new MovieDb(process.env.TMDB_API);
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

async function getCatalog(type, language, page, id, genre, config, catalogChoices) {
  try {
    if (id.startsWith("mdblist.")) {
      const listId = id.split(".")[1];
      const results = await fetchMDBListItems(listId, config.mdblistkey, language, page);
      return await parseMDBListItems(results, type, genre, language, config);
    }

    const genreList = await getGenreList(language, type);
    const parameters = await buildParameters(type, language, page, id, genre, genreList, config);

    const fetchFunction = type === "movie" 
      ? moviedb.discoverMovie.bind(moviedb) 
      : moviedb.discoverTv.bind(moviedb);

    const res = await fetchFunction(parameters);

    const metaPromises = res.results.map(item => 
      getMeta(type, language, `tmdb:${item.id}`, config, catalogChoices, false)
        .then(result => result.meta)
        .catch(err => {
          console.error(`Error fetching metadata for tmdb:${item.id}:`, err.message);
          return null;
        })
    );

    const metas = (await Promise.all(metaPromises)).filter(Boolean);
    return { metas };

  } catch (error) {
    console.error(`Error fetching catalog for id=${id}, type=${type}:`, error.message);
    return { metas: [] };
  }
}

async function buildParameters(type, language, page, id, genre, genreList, config) {
  const languages = await getLanguages();
  const parameters = { language, page, 'vote_count.gte': 10 };

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


module.exports = { getCatalog };
