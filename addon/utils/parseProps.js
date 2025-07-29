const { decompressFromEncodedURIComponent } = require('lz-string');
const axios = require('axios');
const fanart = require('./fanart');

const idMapper = require('../lib/id-mapper');

const host = process.env.HOST_NAME.startsWith('http')
    ? process.env.HOST_NAME
    : `https://${process.env.HOST_NAME}`;

function sortSearchResults(results, query) {
  const lowerCaseQuery = query.toLowerCase();
  results.sort((a, b) => {
    const titleA = (a.name || '').toLowerCase();
    const titleB = (b.name || '').toLowerCase();
    if (titleA === lowerCaseQuery && titleB !== lowerCaseQuery) return -1;
    if (titleA !== lowerCaseQuery && titleB === lowerCaseQuery) return 1;
    const startsWithA = titleA.startsWith(lowerCaseQuery);
    const startsWithB = titleB.startsWith(lowerCaseQuery);
    if (startsWithA && !startsWithB) return -1;
    if (!startsWithA && startsWithB) return 1;
    const scoreA = a.popularity || a.score || 0;
    const scoreB = b.popularity || b.score || 0;
    if (scoreA !== scoreB) return scoreB - scoreA;
    const yearA = parseInt(a.year, 10) || 0;
    const yearB = parseInt(b.year, 10) || 0;
    if (yearA !== yearB) return yearB - yearA;
    return 0;
  });
  return results;
}

function parseMedia(el, type, genreList = []) {
  const genres = Array.isArray(el.genre_ids)
    ? el.genre_ids.map(genreId => (genreList.find((g) => g.id === genreId) || {}).name).filter(Boolean)
    : [];

  return {
    id: `tmdb:${el.id}`,
    name: type === 'movie' ? el.title : el.name,
    genre: genres,
    poster: el.poster_path ? `https://image.tmdb.org/t/p/w500${el.poster_path}` : null,
    background: el.backdrop_path ? `https://image.tmdb.org/t/p/original${el.backdrop_path}` : null,
    posterShape: "regular",
    imdbRating: el.vote_average ? el.vote_average.toFixed(1) : 'N/A',
    year: type === 'movie' ? (el.release_date?.substring(0, 4) || '') : (el.first_air_date?.substring(0, 4) || ''),
    type: type === 'movie' ? type : 'series',
    description: el.overview,
  };
}


function parseCast(credits, count) {
  if (!credits || !Array.isArray(credits.cast)) return [];
  const cast = credits.cast;
  const toParse = count === undefined || count === null ? cast : cast.slice(0, count);

  return toParse.map((el) => {
    let photoUrl = null;
    if (el.profile_path) {
      if (el.profile_path.startsWith('http')) {
        photoUrl = el.profile_path;
      } else {
        photoUrl = `https://image.tmdb.org/t/p/w276_and_h350_face${el.profile_path}`;
      }
    }
    return {
      name: el.name,
      character: el.character,
      photo: photoUrl
    };
  });
}

function parseDirector(credits) {
  if (!credits || !Array.isArray(credits.crew)) return [];
  return credits.crew.filter((x) => x.job === "Director").map((el) => el.name);
}

function parseWriter(credits) {
    if (!credits || !Array.isArray(credits.crew)) return [];
    const writers = credits.crew.filter((x) => x.department === "Writing").map((el) => el.name);
    const creators = credits.crew.filter((x) => x.job === "Creator").map((el) => el.name);
    return [...new Set([...writers, ...creators])];
}

function parseSlug(type, title, imdbId, uniqueIdFallback = null) {
  const safeTitle = (title || '')
    .toLowerCase()
    .replace(/\s+/g, '-') 
    .replace(/[^\w\-]+/g, '');

  let identifier = '';
  if (imdbId) {
    identifier = imdbId.replace('tt', '');
  } else if (uniqueIdFallback) {
    identifier = String(uniqueIdFallback);
  }

  return identifier ? `${type}/${safeTitle}-${identifier}` : `${type}/${safeTitle}`;
}

function parseTrailers(videos) {
    if (!videos || !Array.isArray(videos.results)) return [];
    return videos.results
        .filter((el) => el.site === "YouTube" && el.type === "Trailer")
        .map((el) => ({ source: el.key, type: el.type, name: el.name, ytId: el.key }));
}

function parseTrailerStream(videos) {
    if (!videos || !Array.isArray(videos.results)) return [];
    return videos.results
        .filter((el) => el.site === "YouTube" && el.type === "Trailer")
        .map((el) => ({ title: el.name, ytId: el.key }));
}

function parseImdbLink(vote_average, imdb_id) {
  return {
    name: vote_average,
    category: "imdb",
    url: `https://imdb.com/title/${imdb_id}`,
  };
}

function parseShareLink(title, imdb_id, type) {
  return {
    name: "Share",
    category: "share",
    url: `https://www.strem.io/s/${type}/${imdb_id}/${encodeURIComponent(title)}`,
  };
}

function parseGenreLink(genres, type, configString, stremioType) {
  if (!Array.isArray(genres) || !process.env.HOST_NAME) return [];
  const manifestPath = configString ? `${configString}/manifest.json` : 'manifest.json';
  const manifestUrl = `${host}/${manifestPath}`;

  return genres.map((genre) => {
    if (!genre || !genre.name) return null;

    let searchUrl;
    
    if (type === 'anime') {
      const genreId = genre.mal_id;
      if (!genreId) return null;
      let url = `stremio:///discover/${encodeURIComponent(
        manifestUrl
      )}/anime/mal.genre_search?genre_id=${genreId}`;
      if (stremioType === 'movie') {
        url += `&type_filter=movie`;
      } else if (stremioType === 'series') {
        url += `&type_filter=tv`;
      }
      searchUrl = url;
      
    } else {
      searchUrl = `stremio:///discover/${encodeURIComponent(
        manifestUrl
      )}/${type}/tmdb.top?genre=${encodeURIComponent(
        genre.name
      )}`;
    }

    return {
      name: genre.name,
      category: "Genres",
      url: searchUrl,
    };
  }).filter(Boolean);
}

function parseCreditsLink(credits, castCount) {
  const castData = parseCast(credits, castCount);
  const Cast = castData.map((actor) => ({
    name: actor.name, category: "Cast", url: `stremio:///search?search=${encodeURIComponent(actor.name)}`
  }));
  const Director = parseDirector(credits).map((director) => ({
    name: director, category: "Directors", url: `stremio:///search?search=${encodeURIComponent(director)}`,
  }));
  const Writer = parseWriter(credits).map((writer) => ({
    name: writer, category: "Writers", url: `stremio:///search?search=${encodeURIComponent(writer)}`,
  }));
  return [...Cast, ...Director, ...Writer];
}

function buildLinks(imdbRating, imdbId, title, type, genres, credits, language, castCount, catalogChoices) {
  const links = [];

  if (imdbId) {
    links.push(parseImdbLink(imdbRating, imdbId));
    links.push(parseShareLink(title, imdbId, type));
  }
  
  const genreLinks = parseGenreLink(genres, type, catalogChoices);
  if (genreLinks.length > 0) {
    links.push(...genreLinks);
  }

  const creditLinks = parseCreditsLink(credits, castCount);
  if (creditLinks.length > 0) {
    links.push(...creditLinks);
  }
  return links.filter(Boolean);
}


function parseCoutry(production_countries) {
  return production_countries?.map((country) => country.name).join(", ") || '';
}

function parseGenres(genres) {
  return genres?.map((el) => el.name) || [];
}

function parseYear(status, first_air_date, last_air_date) {
  const startYear = first_air_date ? first_air_date.substring(0, 4) : '';
  if (status === "Ended" && last_air_date) {
    const endYear = last_air_date.substring(0, 4);
    return startYear === endYear ? startYear : `${startYear}-${endYear}`;
  }
  return startYear;
}


function parseAnimeCreditsLink(characterData, type, configString, castCount) {
  if (!characterData || !characterData.length === 0) return [];

  const host = process.env.HOST_NAME.startsWith('http')
    ? process.env.HOST_NAME
    : `https://${process.env.HOST_NAME}`;
  const manifestPath = configString ? `${configString}/manifest.json` : 'manifest.json';
  const manifestUrl = `${host}/${manifestPath}`;

  const voiceActorLinks = characterData.slice(0, castCount).map(charEntry => {
    const voiceActor = charEntry.voice_actors.find(va => va.language === 'Japanese');
    if (!voiceActor) return null;

    const vaMalId = voiceActor.person.mal_id;

    const searchUrl = `stremio:///discover/${encodeURIComponent(
      manifestUrl
    )}/${type}/mal.va_search?va_id=${vaMalId}`;

    return {
      name: voiceActor.person.name,
      category: 'Cast',
      url: searchUrl
    };
  }).filter(Boolean);

  return [...voiceActorLinks];
}



function parseRunTime(runtime) {
  if (!runtime) return "";

  let totalMinutes;

  if (typeof runtime === 'number') {
    totalMinutes = runtime;
  } 
  else if (typeof runtime === 'string') {
    let hours = 0;
    let minutes = 0;

    const hourMatch = runtime.match(/(\d+)\s*hr?/);
    if (hourMatch) {
      hours = parseInt(hourMatch[1], 10);
    }

    const minuteMatch = runtime.match(/(\d+)\s*min?/);
    if (minuteMatch) {
      minutes = parseInt(minuteMatch[1], 10);
    }
    if (hours === 0 && minutes === 0) {
      totalMinutes = parseInt(runtime, 10);
    } else {
      totalMinutes = (hours * 60) + minutes;
    }

  } else {
    return ""; 
  }

  if (isNaN(totalMinutes) || totalMinutes <= 0) {
    return "";
  }

  const finalHours = Math.floor(totalMinutes / 60);
  const finalMinutes = totalMinutes % 60;

  if (finalHours > 0) {
    const hourString = `${finalHours}h`;
    const minuteString = finalMinutes > 0 ? `${finalMinutes}min` : '';
    return `${hourString}${minuteString}`;
  } else {
    return `${finalMinutes}min`;
  }
}

function parseCreatedBy(created_by) {
  return created_by?.map((el) => el.name).join(', ') || '';
}

function parseConfig(catalogChoices) {
  if (!catalogChoices) return {};
  try {
    return JSON.parse(decompressFromEncodedURIComponent(catalogChoices));
  } catch (e) {
    try { return JSON.parse(catalogChoices); } catch { return {}; }
  }
}

function getRpdbPoster(type, ids, language, rpdbkey) {
    const tier = rpdbkey.split("-")[0]
    const lang = language.split("-")[0]
    const { tmdbId, tvdbId } = ids;
    let baseUrl = `https://api.ratingposterdb.com`;
    let idType = null;
    let fullMediaId = null;
    if (type === 'movie' && tmdbId) {
        idType = 'tmdb';
        fullMediaId = `movie-${tmdbId}`;
    } else if (type === 'series') {
        if (tvdbId) {
            idType = 'tvdb';
            fullMediaId = tvdbId;
        } else if (tmdbId) {
            idType = 'tmdb';
            fullMediaId = `series-${tmdbId}`;
        }
    }
    if (!idType || !fullMediaId) {
        return null;
    }

    const urlPath = `${baseUrl}/${rpdbkey}/${idType}/poster-default/${fullMediaId}.jpg`;
    //console.log(urlPath);
    if (tier === "t0" || tier === "t1" || lang === "en") {
        return `${urlPath}?fallback=true`;
    } else {
        return `${urlPath}?fallback=true&lang=${lang}`;
    }
}

async function checkIfExists(url) {
  try {
    const response = await axios.head(url, {
      maxRedirects: 0,
      validateStatus: () => true,
      headers: { 'User-Agent': 'AIOMetadataAddon/1.0' }
    });
    return response.status === 200;
  } catch (error) {
    if (error.message.includes('Invalid URL')) {
      return false;
    }
    console.error(`Network error in checkIfExists for URL ${url}:`, error.message);
    return false;
  }
}

async function parsePoster(type, ids, fallbackFullUrl, language, rpdbkey) {
  if (rpdbkey) {
    const rpdbImage = getRpdbPoster(type, ids, language, rpdbkey);
    if (rpdbImage && await checkIfExists(rpdbImage)) {
      return rpdbImage;
    }
  }
  return fallbackFullUrl;
}

async function getAnimeBg({ tvdbId, tmdbId, malPosterUrl, mediaType = 'series' }) {
  let fanartUrl = null;
  if (mediaType === 'series' && tvdbId) {
    fanartUrl = await fanart.getBestSeriesBackground(tvdbId);
  } else if (mediaType === 'movie' && tmdbId) {
    fanartUrl = await fanart.getBestMovieBackground(tmdbId);
  }

  if (fanartUrl) {
    console.log(`[getAnimeBg] Found high-quality Fanart.tv background.`);
    return fanartUrl;
  }

  console.log(`[getAnimeBg] No Fanart or TMDB background found. Falling back to MAL poster.`);
  return malPosterUrl;
}

function parseAnimeCatalogMeta(anime, config, language) {
  if (!anime || !anime.mal_id) return null;

  const malId = anime.mal_id;
  const stremioType = anime.type?.toLowerCase() === 'movie' ? 'movie' : 'series';

  const mapping = idMapper.getMappingByMalId(malId);
  const malPosterUrl = anime.images?.jpg?.large_image_url;
  let finalPosterUrl = malPosterUrl;
  const kitsuId = mapping.kitsu_id;
  const imdbId = mapping?.imdb_id;
  const metaType = (kitsuId || imdbId) ? stremioType : 'anime';
  if (config.rpdbkey) {
    
    if (mapping) {
      const tvdbId = mapping.thetvdb_id;
      const tmdbId = mapping.themoviedb_id;
      let proxyId = null;

      if (stremioType === 'series') {
        proxyId = tvdbId ? `tvdb:${tvdbId}` : (tmdbId ? `tmdb:${tmdbId}` : null);
      } else if (stremioType === 'movie') {
        proxyId = tmdbId ? `tmdb:${tmdbId}` : null;
      }
      
      if (proxyId) {
        const fallback = encodeURIComponent(malPosterUrl);
        finalPosterUrl = `${host}/poster/${stremioType}/${proxyId}?fallback=${fallback}&lang=${language}&key=${config.rpdbkey}`;
      }
    }
  }


  return {
    id: `mal:${malId}`,
    type: 'anime',
    name: anime.title_english || anime.title,
    poster: finalPosterUrl,
    description: anime.synopsis,
    year: anime.year,
    isAnime: true
  };
}

module.exports = {
  parseMedia, 
  parseCast,
  parseDirector,
  parseWriter,
  parseSlug,
  parseTrailers,
  parseTrailerStream,
  parseImdbLink,
  parseShareLink,
  parseGenreLink,
  parseCreditsLink,
  buildLinks,
  parseCoutry,
  parseGenres,
  parseYear,
  parseRunTime,
  parseCreatedBy,
  parseConfig,
  parsePoster,
  getRpdbPoster,
  checkIfExists,
  sortSearchResults,
  parseAnimeCreditsLink,
  getAnimeBg,
  parseAnimeCatalogMeta
};
