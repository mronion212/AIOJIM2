require("dotenv").config();
const { MovieDb } = require("moviedb-promise");
const { getGenreList } = require("./getGenreList");
const Utils = require("../utils/parseProps");
const tvdb = require("./tvdb");
const { to3LetterCode } = require("./language-map"); 
const jikan = require('./mal');
const moviedb = new MovieDb(process.env.TMDB_API);
const { isAnime } = require("../utils/isAnime");
function sanitizeQuery(query) {
  if (!query) return '';
  return query.replace(/[\[\]()!?]/g, ' ').replace(/[:.-]/g, ' ').trim().replace(/\s\s+/g, ' ');
}

const host = process.env.HOST_NAME.startsWith('http')
    ? process.env.HOST_NAME
    : `https://${process.env.HOST_NAME}`;

async function parseTvdbSearchResult(extendedRecord, language, config) {
  if (!extendedRecord || !extendedRecord.id || !extendedRecord.name) return null;

  const langCode = language.split('-')[0];
  const langCode3 = await to3LetterCode(langCode);
  const overviewTranslations = extendedRecord.translations?.overviewTranslations || [];
  const nameTranslations = extendedRecord.translations?.nameTranslations || [];
  const translatedName = nameTranslations.find(t => t.language === langCode3)?.name
                       || nameTranslations.find(t => t.language === 'eng')?.name
                       || extendedRecord.name;

  const overview = overviewTranslations.find(t => t.language === langCode3)?.overview
                   || overviewTranslations.find(t => t.language === 'eng')?.overview
                   || extendedRecord.overview;
  
  const tmdbId = extendedRecord.remoteIds?.find(id => id.sourceName === 'TheMovieDB')?.id;
  const tvdbId = extendedRecord.id;
  var fallbackImage = extendedRecord.image === null ? "https://artworks.thetvdb.com/banners/images/missing/series.jpg" : extendedRecord.image;
  const posterProxyUrl = `${host}/poster/series/tvdb:${tvdbId}?fallback=${encodeURIComponent(fallbackImage)}&lang=${language}&key=${config.rpdbkey}`;
  return {
    id: `tvdb:${extendedRecord.id}`,
    type: 'series',
    name: translatedName, 
    poster: config.rpdbkey ? posterProxyUrl : fallbackImage,
    year: extendedRecord.year,
    description: overview,
    //isAnime: isAnime(extendedRecord)
  };
}

async function performAnimeSearch(query, language, config) {
  const searchResults = await jikan.searchAnime(query, 25, config);
  const desiredTypes = new Set(['tv', 'movie', 'ova', 'ona']);
  
  const metas = searchResults.filter(item => {
    return typeof item?.type === 'string' && desiredTypes.has(item.type.toLowerCase());
  }).map(anime => 
    Utils.parseAnimeCatalogMeta(anime, config, language)
  ).filter(Boolean);
  //console.log(metas); 
  return metas;
}

async function performMovieSearch(query, language, config, genreList) {
    const searchResults = new Map();
    const rawResults = new Map();

    const addRawResult = (media) => {
        if (media && media.id && !rawResults.has(media.id)) {
            rawResults.set(media.id, media);
        }
    };

    const movieRes = await moviedb.searchMovie({ query, language, include_adult: config.includeAdult });
    movieRes.results.forEach(addRawResult);

    const personRes = await moviedb.searchPerson({ query, language });
    if (personRes.results?.[0]) {
        const credits = await moviedb.personMovieCredits({ id: personRes.results[0].id, language });
        credits.cast.forEach(addRawResult);
        credits.crew.forEach(media => { if (media.job === "Director" || media.job === "Writer") addRawResult(media); });
    }

    const hydrationPromises = Array.from(rawResults.values()).map(async (media) => {
        const parsed = Utils.parseMedia(media, 'movie', genreList);
        const tmdbPosterFullUrl = media.poster_path === null ? `https://artworks.thetvdb.com/banners/images/missing/series.jpg` : `https://image.tmdb.org/t/p/w500${media.poster_path}`;
        const posterProxyUrl = `${host}/poster/movie/tmdb:${media.id}?fallback=${encodeURIComponent(tmdbPosterFullUrl)}&lang=${language}&key=${config.rpdbkey}`;
        parsed.poster = config.rpdbkey ? posterProxyUrl : tmdbPosterFullUrl;
        //parsed.isAnime = isAnime(media, genreList);
        parsed.popularity = media.popularity;
        return parsed;
    });

    const hydratedMetas = await Promise.all(hydrationPromises);
    hydratedMetas.forEach(parsed => {
        if(parsed && !searchResults.has(parsed.id)) searchResults.set(parsed.id, parsed);
    });
    
    const finalResults = Array.from(searchResults.values());
    return Utils.sortSearchResults(finalResults, query); 
}

async function performSeriesSearch(query, language, config) {
  const sanitizedQuery = sanitizeQuery(query);
  if (!sanitizedQuery) return [];

  const [titleResults, peopleResults] = await Promise.all([
    tvdb.searchSeries(sanitizedQuery),
    tvdb.searchPeople(sanitizedQuery)
  ]);

  const seriesIdMap = new Map();

  
  titleResults.forEach(result => {
    if (result.tvdb_id) seriesIdMap.set(result.tvdb_id, true);
  });

  
  if (peopleResults.length > 0) {
    const topPerson = peopleResults[0];
    const personDetails = await tvdb.getPersonExtended(topPerson.tvdb_id);
    if (personDetails && personDetails.characters) {
      personDetails.characters.forEach(credit => {
        if (credit.seriesId) seriesIdMap.set(String(credit.seriesId), true);
      });
    }
  }

  const uniqueIds = Array.from(seriesIdMap.keys());
  if (uniqueIds.length === 0) {
    return [];
  }

  const detailPromises = uniqueIds.map(id => tvdb.getSeriesExtended(id));
  const detailedResults = await Promise.all(detailPromises);
  
  const parsePromises = detailedResults.map(record => parseTvdbSearchResult(record, language, config));
  const finalResults = (await Promise.all(parsePromises)).filter(Boolean);
  return Utils.sortSearchResults(finalResults, query);
}

async function getSearch(id, type, language, extra, config) {
  try {
    if (!extra) {
      console.warn(`Search request for id '${id}' received with no 'extra' argument.`);
      return { metas: [] };
    }
    const timerLabel = `Search for "${extra}" (type: ${id})`;
    console.time(timerLabel);
    const extraArgs = (typeof extra === 'string') ? { search: extra } : extra;
    console.log(extraArgs);
    let metas = [];


    if (id === 'mal.genre_search' && type === 'anime') {
      const genreId = extraArgs.genre_id; 
      const typeFilter = extraArgs.type_filter;
      const results = await jikan.getAnimeByGenre(genreId, typeFilter, 25, config);
      metas = results.map(item => ({
        id: `mal:${item.mal_id}`,
        type: 'anime',
        name: item.title,
        poster: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url,
        year: item.year,
        description: item.synopsis
      }));

    } else if (id === 'mal.va_search' && type === 'anime') {
      const personId = extraArgs.va_id; 
      const roles = await jikan.getAnimeByVoiceActor(personId);
      metas = roles.map(role => ({
        id: `mal:${role.anime.mal_id}`,
        type: 'anime',
        name: role.anime.title,
        poster: role.anime.images?.jpg?.large_image_url || role.anime.images?.jpg?.image_url,
        description: `Role: ${role.character.name}`,
      }));

    } else {
      const query = extraArgs.search;
      if (!query) {
        console.warn(`Standard search request for id '${id}' received with no query text.`);
        return { metas: [] };
      }
      
      switch (type) {
        case 'movie':
          const genreList = await getGenreList(language, type);
          metas = await performMovieSearch(query, language, config, genreList);
          break;
        case 'series':
          metas = await performSeriesSearch(query, language, config);
          break;
        case 'anime':
          metas = await performAnimeSearch(query, language, config);
          break;
      }
    }
    console.timeEnd(timerLabel);
    return { metas };
  } catch (error) {
    console.timeEnd(timerLabel);
    console.error(`Error during search for id "${id}":`, error);
    return { metas: [] };
  }
}


module.exports = { getSearch };
