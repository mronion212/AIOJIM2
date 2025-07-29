require("dotenv").config();
const { MovieDb } = require("moviedb-promise");
const Utils = require("../utils/parseProps");
const moviedb = new MovieDb(process.env.TMDB_API);
const tvdb = require("./tvdb");
const { getLogo } = require("./getLogo");
const { getImdbRating } = require("./getImdbRating");
const { to3LetterCode } = require('./language-map');
const jikan = require('./mal');
const TVDB_IMAGE_BASE = 'https://artworks.thetvdb.com';
const idMapper = require('./id-mapper');


const processLogo = (logoUrl) => {
  if (!logoUrl) return null;
  return logoUrl.replace(/^http:/, "https:");
};
const host = process.env.HOST_NAME.startsWith('http')
    ? process.env.HOST_NAME
    : `https://${process.env.HOST_NAME}`;

// --- Main Orchestrator ---
async function getMeta(type, language, stremioId, config = {}, catalogChoices) {
  try {
    let meta;
    switch (type) {
      case 'movie':
        meta = await getMovieMeta(stremioId, language, config, catalogChoices);
        break;
      case 'series':
        meta = await getSeriesMeta(stremioId, language, config, catalogChoices);
        break;
      case 'anime':
        meta = await getAnimeMeta(stremioId, language, config, catalogChoices);
        break;
      default:
        meta = null;
    }
    return { meta };
  } catch (error) {
    console.error(`Failed to get meta for ${type} with ID ${stremioId}:`, error.message);
    return { meta: null };
  }
}

// --- Movie Worker ---
async function getMovieMeta(stremioId, language, config, catalogChoices) {
  let tmdbId = stremioId.replace('tmdb:', '');
  if (stremioId.startsWith('tt')) {
    const findResults = await moviedb.find({ id: stremioId, external_source: 'imdb_id' });
    const movieTmdb = findResults.movie_results?.[0];
    if (!movieTmdb) throw new Error(`Movie with IMDb ID ${stremioId} not found on TMDB.`);
    tmdbId = movieTmdb.id;
  }
  const movieData = await moviedb.movieInfo({ id: tmdbId, language, append_to_response: "videos,credits,external_ids" });
  return buildMovieResponse(movieData, language, config, catalogChoices);
}

// --- Series Worker (TVDB Version) ---
async function getSeriesMeta(stremioId, language, config, catalogChoices) {
  let tvdbId;
  if (stremioId.startsWith('tvdb:')) {
    tvdbId = stremioId.split(':')[1];
  } else {
    
    const tmdbIdToFind = stremioId.startsWith('tmdb:') ? stremioId.split(':')[1] : (await moviedb.find({ id: stremioId, external_source: 'imdb_id' })).tv_results[0]?.id;
    if (!tmdbIdToFind) throw new Error(`Could not resolve ${stremioId} to a TMDB ID.`);
    
    const tmdbInfo = await moviedb.tvInfo({ id: tmdbIdToFind, append_to_response: 'external_ids' });
    tvdbId = tmdbInfo.external_ids?.tvdb_id;
  }

  if (!tvdbId) {
    throw new Error(`Could not resolve ${stremioId} to a TVDB ID.`);
  }

  
  const [baseData, episodesData] = await Promise.all([
    tvdb.getSeriesExtended(tvdbId),
    tvdb.getSeriesEpisodes(tvdbId, language)
  ]);

  if (!baseData || !episodesData) {
    throw new Error(`Could not fetch complete data for TVDB ID ${tvdbId}.`);
  }

  return buildSeriesResponseFromTvdb(baseData, episodesData, language, config, catalogChoices);
}

// --- Anime worker ---

async function getAnimeMeta(stremioId, language, config, catalogChoices) {
  const malId = stremioId.replace('mal:', '');
  
  const results = await Promise.allSettled([
    jikan.getAnimeDetails(malId),
    jikan.getAnimeCharacters(malId),
    jikan.getAnimeEpisodes(malId)
  ]);

  const malDataResult = results[0];
  const characterDataResult = results[1];
  const episodeDataResult = results[2];

  if (malDataResult.status === 'rejected' || !malDataResult.value) {
    if (malDataResult.reason) {
      console.error(`Jikan details fetch failed for MAL ID ${malId}:`, malDataResult.reason.message);
    }
    throw new Error(`Could not fetch critical data from Jikan for MAL ID ${malId}`);
  }
  
  const malData = malDataResult.value;
  const characterData = characterDataResult.status === 'fulfilled' ? characterDataResult.value : [];
  const episodeData = episodeDataResult.status === 'fulfilled' ? episodeDataResult.value : [];

  console.log(`[getAnimeMeta] Data collected for MAL ID ${malId}:`);
  console.log(`  - Details: ${malData ? 'Success' : 'Failed'}`);
  console.log(`  - Characters: ${characterData.length} found.`);
  console.log(`  - Episodes: ${episodeData.length} found.`);
  
  const mapping = idMapper.getMappingByMalId(malId);

  const bestBackgroundUrl = await Utils.getAnimeBg({
    tvdbId: mapping?.thetvdb_id,
    tmdbId: mapping?.themoviedb_id,
    malPosterUrl: malData.images?.jpg?.large_image_url,
    mediaType: malData.type?.toLowerCase() === 'movie' ? 'movie' : 'series'
  });
  
  return buildAnimeResponse(malData, language, characterData, episodeData, config, catalogChoices, {
    mapping,
    bestBackgroundUrl
  });
}

// --- BUILDERS ---

async function buildMovieResponse(movieData, language, config, catalogChoices) {
  const { id: tmdbId, title, external_ids, poster_path, credits } = movieData;
  const imdbId = external_ids?.imdb_id;
  const castCount = config.castCount === 'unlimited' ? undefined : ([5, 10, 15].includes(config.castCount) ? config.castCount : 5);
  const [logoUrl, imdbRatingValue] = await Promise.all([
    getLogo('movie', { tmdbId }, language, movieData.original_language),
    getImdbRating(imdbId, 'movie')
  ]);
  const imdbRating = imdbRatingValue || movieData.vote_average?.toFixed(1) || "N/A";
  const fallbackPosterUrl = `https://image.tmdb.org/t/p/w500${poster_path}`;
  const posterProxyUrl = `${host}/poster/movie/tmdb:${movieData.id}?fallback=${encodeURIComponent(fallbackPosterUrl)}&lang=${language}&key=${config.rpdbkey}`;
  //console.log(Utils.parseCast(credits, castCount));
  return {
    id: `tmdb:${tmdbId}`,
    type: 'movie',
    name: title,
    imdb_id: imdbId,
    slug: Utils.parseSlug('movie', title, imdbId),
    genres: Utils.parseGenres(movieData.genres),
    description: movieData.overview,
    director: Utils.parseDirector(credits).join(', '),
    writer: Utils.parseWriter(credits).join(', '),
    year: movieData.release_date ? movieData.release_date.substring(0, 4) : "",
    released: new Date(movieData.release_date),
    runtime: Utils.parseRunTime(movieData.runtime),
    country: Utils.parseCoutry(movieData.production_countries),
    imdbRating,
    poster: config.rpdbkey ? posterProxyUrl : fallbackPosterUrl,
    background: `https://image.tmdb.org/t/p/original${movieData.backdrop_path}`,
    logo: processLogo(logoUrl),
    trailers: Utils.parseTrailers(movieData.videos),
    trailerStreams: Utils.parseTrailerStream(movieData.videos),
    links: Utils.buildLinks(imdbRating, imdbId, title, 'movie', movieData.genres, credits, language, castCount, catalogChoices),
    behaviorHints: { defaultVideoId: imdbId || `tmdb:${tmdbId}`, hasScheduledVideos: false },
    app_extras: { cast: Utils.parseCast(credits, castCount) }
  };
}

async function buildSeriesResponseFromTvdb(tvdbShow, tvdbEpisodes, language, config, catalogChoices) {
  const { year, image: tvdbPosterPath, remoteIds, characters, episodes } = tvdbShow;
  const langCode = language.split('-')[0];
  const langCode3 = await to3LetterCode(langCode);
  const nameTranslations = tvdbShow.translations?.nameTranslations || [];
  const overviewTranslations = tvdbShow.translations?.overviewTranslations || [];
  const translatedName = nameTranslations.find(t => t.language === langCode3)?.name
             || nameTranslations.find(t => t.language === 'eng')?.name
             || tvdbShow.name;
             
  const overview = overviewTranslations.find(t => t.language === langCode3)?.overview
                   || overviewTranslations.find(t => t.language === 'eng')?.overview
                   || tvdbShow.overview;
  const imdbId = remoteIds?.find(id => id.sourceName === 'IMDB')?.id;
  const tmdbId = remoteIds?.find(id => id.sourceName === 'TheMovieDB')?.id;
  const tvdbId = tvdbShow.id;
  const castCount = config.castCount === 'unlimited' ? undefined : ([5, 10, 15].includes(config.castCount) ? config.castCount : 5);

  const [logoUrl, imdbRatingValue] = await Promise.all([
    getLogo('series', { tmdbId: tmdbId?.toString(), tvdbId: tvdbId?.toString() }, language, tvdbShow.originalLanguage),
    getImdbRating(imdbId, 'series')
  ]);
  const imdbRating = imdbRatingValue || "N/A";
  console.log(imdbId);
  console.log(tvdbShow.score);
  console.log(imdbRatingValue);
  const fallbackPosterUrl = tvdbPosterPath ? `${tvdbPosterPath}` : `https://artworks.thetvdb.com/banners/images/missing/series.jpg`;
  const posterProxyUrl = `${host}/poster/series/tvdb:${tvdbShow.id}?fallback=${encodeURIComponent(fallbackPosterUrl)}&lang=${language}&key=${config.rpdbkey}`;
  const tmdbLikeCredits = {
    cast: (characters || []).map(c => ({
      name: c.personName,
      character: c.name,
      profile_path: c.image 
    })),
    crew: []
  };

  const videos = (tvdbEpisodes.episodes || [])
    .map(episode => ({
      id: `${imdbId || `tvdb${tvdbId}`}:${episode.seasonNumber}:${episode.number}`,
      title: episode.name || `Episode ${episode.number}`,
      season: episode.seasonNumber,
      episode: episode.number,
      thumbnail: episode.image ? `${TVDB_IMAGE_BASE}${episode.image}` : null,
      overview: episode.overview,
      released: episode.aired ? new Date(episode.aired) : null,
      available: episode.aired ? new Date(episode.aired) < new Date() : false,
  })); 
  //console.log(tvdbShow.artworks?.find(a => a.type === 2)?.image);
  const meta = {
    id: tmdbId ? `tmdb:${tmdbId}` : `tvdb:${tvdbId}`,
    type: 'series',
    name: translatedName,
    imdb_id: imdbId,
    slug: Utils.parseSlug('series', translatedName, imdbId),
    genres: tvdbShow.genres?.map(g => g.name) || [],
    description: overview,
    writer: (tvdbShow.companies?.production || []).map(p => p.name).join(', '),
    year: year,
    released: new Date(tvdbShow.firstAired),
    runtime: Utils.parseRunTime(tvdbShow.averageRuntime),
    status: tvdbShow.status?.name,
    country: tvdbShow.originalCountry,
    imdbRating,
    poster: config.rpdbkey ? posterProxyUrl : fallbackPosterUrl,
    background: tvdbShow.artworks?.find(a => a.type === 2)?.image, 
    logo: processLogo(logoUrl),
    videos: videos,
    links: Utils.buildLinks(imdbRating, imdbId, translatedName, 'series', tvdbShow.genres, tmdbLikeCredits, language, castCount, catalogChoices),
    behaviorHints: { defaultVideoId: null, hasScheduledVideos: true },
    app_extras: { cast: Utils.parseCast(tmdbLikeCredits, castCount) }
  };
  //console.log(Utils.parseCast(tmdbLikeCredits, castCount));
  return meta;
}


async function buildAnimeResponse(malData, language, characterData, episodeData, config, catalogChoices, enrichmentData = {}) {
  try {
    const { mapping, bestBackgroundUrl } = enrichmentData;
    const stremioType = malData.type.toLowerCase() === 'movie' ? 'movie' : 'series';
    const imdbId = mapping?.imdb_id;
    const kitsuId = mapping?.kitsu_id;
    const imdbRating = typeof malData.score === 'number' ? malData.score.toFixed(1) : "N/A";
    const castCount = config.castCount === 'unlimited' ? undefined : ([5, 10, 15].includes(config.castCount) ? config.castCount : 5);
       
    let videos = [];
    const posterUrl = malData.images?.jpg?.large_image_url;
    
    let finalPosterUrl = posterUrl; 

    if (config.rpdbkey && mapping) {
      const tvdbId = mapping.thetvdb_id;
      const tmdbId = mapping.themoviedb_id;
      let proxyId = null;
      let proxyType = stremioType;

      if (stremioType === 'series') {
        if (tvdbId) {
          proxyId = `tvdb:${tvdbId}`;
        } else if (tmdbId) {
          proxyId = `tmdb:${tmdbId}`; 
        }
      } else if (stremioType === 'movie') {
        if (tmdbId) {
          proxyId = `tmdb:${tmdbId}`;
        }
      }

      if (proxyId) {
        const fallback = encodeURIComponent(posterUrl);
        finalPosterUrl = `${host}/poster/${proxyType}/${proxyId}?fallback=${fallback}&lang=${language}&key=${config.rpdbkey}`;
        console.log(`[buildAnimeResponse] Constructed RPDB Poster Proxy URL: ${finalPosterUrl}`);
      }
    }
    const seriesId = `mal:${malData.mal_id}`;
    if (stremioType === 'series' && malData.status !== 'Not yet aired' && episodeData && episodeData.length > 0) {
      videos = (episodeData || []).map(ep => {
        let episodeId;
        if (kitsuId) {
          episodeId = `kitsu:${kitsuId}:${ep.mal_id}`;
        }

        else if (imdbId) {
          episodeId = `${imdbId}:1:${ep.mal_id}`;
        }
        else {
          episodeId = `${seriesIdMAL}:${ep.mal_id}`;
        }
        return {
          id:  episodeId,
          title: ep.title,
          season: 1,
          episode: ep.mal_id,
          released: ep.aired? new Date(ep.aired) : null,
          thumbnail: config.hideEpisodeThumbnails? `${process.env.HOST_NAME}/api/image/blur?url=${encodeURIComponent(posterUrl)}` : posterUrl,
          available: ep.aired ? new Date(ep.aired) < new Date() : false
        };
      });
    }

    const tmdbLikeCredits = {
      cast: (characterData || [])
        .map(charEntry => {
          const voiceActor = charEntry.voice_actors.find(va => va.language === 'Japanese');
          if (!voiceActor) return null;
          return {
            name: voiceActor.person.name.replace(",", ""),
            profile_path: voiceActor.person.images.jpg.image_url,
            character: charEntry.character.name.replace(",", ""),
          };
        })
        .filter(Boolean),
      crew: []
    };

    const trailerStreams = [];
    if (malData.trailer?.youtube_id) {
      trailerStreams.push({
        ytId: malData.trailer.youtube_id,
        title: malData.title_english || malData.title
      });
    }

    const links = [];

    if (imdbId) {
      links.push(Utils.parseImdbLink(imdbRating, imdbId));
      links.push(Utils.parseShareLink(malData.title, imdbId, stremioType));
    }

    links.push(...Utils.parseGenreLink(malData.genres, 'anime', catalogChoices, stremioType));
    links.push(...Utils.parseAnimeCreditsLink(characterData, 'anime', catalogChoices, castCount));
 
    return {
      id: `mal:${malData.mal_id}`,
      type: stremioType,
      name: malData.title_english || malData.title,
      imdb_id: imdbId,
      slug: Utils.parseSlug('series', malData.title_english || malData.title, imdbId, malData.mal_id),
      genres: malData.genres?.map(g => g.name) || [],
      description: malData.synopsis,
      year: malData.year || malData.aired?.from?.substring(0, 4),
      released: new Date(malData.aired?.from || malData.start_date),
      runtime: Utils.parseRunTime(malData.duration),
      status: malData.status,
      imdbRating,
      poster: finalPosterUrl,
      background: bestBackgroundUrl,
      links: links.filter(Boolean),
      behaviorHints: {
        defaultVideoId: stremioType === 'movie' ? ((kitsuId ? `kitsu:${kitsuId}` : null) || imdbId || seriesIdMAL) : null,
        hasScheduledVideos: stremioType === 'series',
      },
      videos: videos,
      app_extras: {
        cast: Utils.parseCast(tmdbLikeCredits, castCount)
      }
    };

  } catch (err) {
    console.error(`Error processing MAL ID ${malData?.mal_id}:`, err);
    return null;
  }
}

module.exports = { getMeta };
