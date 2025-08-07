require("dotenv").config();
const Utils = require("../utils/parseProps");
const moviedb = require("./getTmdb");
const tvdb = require("./tvdb");
const tvmaze = require("./tvmaze");
const { getLogo } = require("./getLogo");
const { getImdbRating } = require("./getImdbRating");
const { to3LetterCode } = require('./language-map');
const jikan = require('./mal');
const TVDB_IMAGE_BASE = 'https://artworks.thetvdb.com';
const idMapper = require('./id-mapper');
const { resolveAllIds } = require('./id-resolver');
const fanart = require('../utils/fanart');


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
    const allIds = await resolveAllIds(stremioId, type, config);
    const isAnime = !!allIds.malId;
    const finalType = isAnime ? 'anime' : type;
    switch (finalType) {
      case 'movie':
        meta = await getMovieMeta(config.providers?.movie, stremioId, language, config, catalogChoices);
        break;
      case 'series':
        meta = await getSeriesMeta(config.providers?.series, stremioId, language, config, catalogChoices);
        break;
      case 'anime':
        meta = await getAnimeMeta(config.providers?.anime, stremioId, language, config, catalogChoices);
        break;
    }
    return { meta };
  } catch (error) {
    console.error(`Failed to get meta for ${type} with ID ${stremioId}:`, error);
    return { meta: null };
  }
}


// --- Movie Worker ---
async function getMovieMeta(preferredProvider, stremioId, language, config, catalogChoices) {
  console.log(`[MovieMeta] Starting process for ${stremioId}. Preferred: ${preferredProvider}`);
  
  const allIds = await resolveAllIds(stremioId, 'movie', config);  
  if (preferredProvider === 'tvdb' && allIds.tvdbId) {
    try {
      const movieData = await tvdb.getMovieExtended(allIds.tvdbId, config);
      return buildTvdbMovieResponse(movieData, language, config, catalogChoices, { allIds });
    } catch (e) {
      console.warn(`[MovieMeta] Preferred provider 'tvdb' failed for ${stremioId}. Falling back.`);
      console.error(`[MovieMeta] Detailed error for provider '${preferredProvider}':`, e);
    }
  }

  if (allIds.tmdbId) {
    try {
      const movieData = await moviedb.movieInfo({ id: allIds.tmdbId, language, append_to_response: "videos,credits,external_ids" }, config);
      return buildTmdbMovieResponse(movieData, language, config, catalogChoices, { allIds });
    } catch (e) {
      console.error(`[MovieMeta] Native provider 'tmdb' also failed for ${stremioId}: ${e.message}`);
    }
  }
  
  return null;
}

async function getSeriesMeta(preferredProvider, stremioId, language, config, catalogChoices) {
  const allIds = await resolveAllIds(stremioId, 'series', config);
  console.log(`[SeriesMeta] Starting process for ${stremioId}. Preferred: ${preferredProvider}`);

  if (preferredProvider === 'tmdb' && allIds.tmdbId) {
    try {
      const seriesData = await moviedb.tvInfo({ id: allIds.tmdbId, language, append_to_response: "videos,credits,external_ids" }, config);
      return buildTmdbSeriesResponse(seriesData, language, config, catalogChoices, { allIds });
    } catch (e) {
      console.warn(`[SeriesMeta] Preferred provider 'tmdb' failed for ${stremioId}. Falling back.`);
    }
  }
  if (preferredProvider === 'tvmaze' && allIds.tvmazeId) {
    try {
      const seriesData = await tvmaze.getShowDetails(allIds.tvmazeId);
      return buildSeriesResponseFromTvmaze(seriesData, language, config, catalogChoices);
    } catch (e) {
      console.warn(`[SeriesMeta] Preferred provider 'tvmaze' failed for ${stremioId}. Falling back.`);
    }
  }

  if (allIds.tvdbId) {
    try {
      const [seriesData, episodes] = await Promise.all([
        tvdb.getSeriesExtended(allIds.tvdbId, config),
        tvdb.getSeriesEpisodes(allIds.tvdbId, language, config.tvdbSeasonType, config)
      ]);
      return buildTvdbSeriesResponse(seriesData, episodes, language, config, catalogChoices, { allIds });
    } catch (e) {
      console.error(`[SeriesMeta] Native provider 'tvdb' also failed for ${stremioId}: ${e.message}`);
    }
  }

  return null;
}

// --- Anime worker ---

async function getAnimeMeta(preferredProvider, stremioId, language, config, catalogChoices) {
  const malId = stremioId.replace('mal:', '');
  const nativeProvider = 'mal'; 

  console.log(`[AnimeMeta] Starting process for ${stremioId}. Preferred: ${preferredProvider}`);

 
  const allIds = await resolveAllIds(stremioId, 'anime', config);

  if (preferredProvider !== nativeProvider) {
    try {
      if (preferredProvider === 'tmdb' && allIds.tmdbId) {
        //console.log(`[AnimeMeta] Attempting preferred provider TMDB with ID: ${allIds.tmdbId}`);
        const mapping = idMapper.getMappingByMalId(malId);
        const tmdbType = mapping?.type?.toLowerCase() === 'movie' ? 'movie' : 'series';
        
        if (tmdbType === 'movie') {
          const movieData = await moviedb.movieInfo({ id: allIds.tmdbId, language, append_to_response: "videos,credits,external_ids" }, config);
          return buildTmdbMovieResponse(movieData, language, config, catalogChoices, { allIds });
        } else {
          const seriesData = await moviedb.tvInfo({ id: allIds.tmdbId, language, append_to_response: "videos,credits,external_ids" }, config);
          return buildTmdbSeriesResponse(seriesData, language, config, catalogChoices, { allIds });
        }
      }
      
      if (preferredProvider === 'tvdb' && allIds.tvdbId) {
        //console.log(`[AnimeMeta] Attempting preferred provider TVDB with ID: ${allIds.tvdbId}`);
        const [seriesData, episodes] = await Promise.all([
            tvdb.getSeriesExtended(allIds.tvdbId, config),
            tvdb.getSeriesEpisodes(allIds.tvdbId, language, config.tvdbSeasonType, config)
        ]);
        return buildTvdbSeriesResponse(seriesData, episodes, language, config, catalogChoices, { allIds });
      }

      if (preferredProvider === 'tvmaze' && allIds.tvmazeId) {
        //console.log(`[AnimeMeta] Attempting preferred provider TVmaze with ID: ${allIds.tvmazeId}`);
        const seriesData = await tvmaze.getShowDetails(allIds.tvmazeId);
        return buildSeriesResponseFromTvmaze(seriesData, language, config, catalogChoices);
      }

      console.log(`[AnimeMeta] No ID found for preferred provider '${preferredProvider}'. Falling back to MAL.`);

    } catch (e) {
      console.warn(`[AnimeMeta] Preferred provider '${preferredProvider}' failed for ${stremioId}. Falling back. Error: ${e.message}`);
    }
  }

  try {
    console.log(`[AnimeMeta] Using native provider 'mal' for ${stremioId}`);
    
    const [details, characters, episodes, episodeVideos] = await Promise.all([
      jikan.getAnimeDetails(allIds.malId),
      jikan.getAnimeCharacters(allIds.malId),
      jikan.getAnimeEpisodes(allIds.malId),
      jikan.getAnimeEpisodeVideos(allIds.malId)
    ]);
    
    if (!details) {
      throw new Error(`Jikan returned no core details for MAL ID ${allIds.malId}.`);
    }
    
    
    const background = await Utils.getAnimeBg({
      tvdbId: allIds.tvdbId,
      tmdbId: allIds.tmdbId,
      malPosterUrl: details.images?.jpg?.large_image_url,
      mediaType: details.type?.toLowerCase() === 'movie' ? 'movie' : 'series'
    }, config);
    
    
    return buildAnimeResponse(details, language, characters, episodes, episodeVideos, config, catalogChoices, { mapping: allIds, bestBackgroundUrl: background });

  } catch (error) {
    console.error(`[AnimeMeta] CRITICAL: Native provider 'mal' also failed for ${stremioId}:`, error.message);
  }
  
  
  return null;
}

// --- BUILDERS ---

async function buildTvdbMovieResponse(movieData, language, config, catalogChoices) {
  const tvdbId = movieData.id;
  const imdbId = movieData.remoteIds?.find(id => id.sourceName === 'IMDB')?.id;
  const tmdbId = movieData.remoteIds?.find(id => id.sourceName === 'TheMovieDB.com')?.id;

  const { year, image: tvdbPosterPath, remoteIds, characters } = movieData;
  const langCode = language.split('-')[0];
  const langCode3 = await to3LetterCode(langCode, config);
  const nameTranslations = movieData.translations?.nameTranslations || [];
  const overviewTranslations = movieData.translations?.overviewTranslations || [];
  const translatedName = nameTranslations.find(t => t.language === langCode3)?.name
             || nameTranslations.find(t => t.language === 'eng')?.name
             || movieData.name;
  const overview = overviewTranslations.find(t => t.language === langCode3)?.overview
  || overviewTranslations.find(t => t.language === 'eng')?.overview
  || movieData.overview;

  const castCount = config.castCount === 0 ? undefined : config.castCount;

  const [logoUrl, imdbRatingValue] = await Promise.all([
    getLogo('movies', { tmdbId: tmdbId?.toString(), tvdbId: tvdbId?.toString() }, language, movieData.originalLanguage, config),
    getImdbRating(imdbId, 'movie')
  ]);
  const imdbRating = imdbRatingValue || "N/A";
  
  const fallbackPosterUrl = tvdbPosterPath ? `${tvdbPosterPath}` : `https://artworks.thetvdb.com/banners/images/missing/series.jpg`;
  const posterProxyUrl = `${host}/poster/series/tvdb:${movieData.id}?fallback=${encodeURIComponent(fallbackPosterUrl)}&lang=${language}&key=${config.apiKeys?.rpdb}`;
  const tmdbLikeCredits = {
    cast: (characters || []).map(c => ({
      name: c.personName,
      character: c.name,
      profile_path: c.image 
    })),
    crew: []
  };
  
  const { trailers, trailerStreams } = Utils.parseTvdbTrailers(movieData.trailers, translatedName);

  const background = movieData.artworks?.find(a => a.type === 15)?.image; // 15 is often the background type

  return {
    id: `tvdb:${tvdbId}`,
    type: 'movie',
    name: translatedName,
    imdb_id: imdbId,
    slug: Utils.parseSlug('movie', translatedName, null, `tvdb:${tvdbId}`),
    genres: movieData.genres?.map(g => g.name) || [],
    description: overview,
    year: year,
    released: movieData.first_release.Date ? new Date(movieData.first_release.Date) : null,
    runtime: Utils.parseRunTime(movieData.runtime),
    country: movieData.originalCountry,
    imdbRating,
    poster: posterProxyUrl,
    background: background,
    logo: processLogo(logoUrl),
    trailers: trailers,
    trailerStreams: trailerStreams,
    behaviorHints: {
      defaultVideoId: imdbId || `tvdb:${tvdbId}`,
      hasScheduledVideos: false
    },
    links: Utils.buildLinks(imdbRating, imdbId, translatedName, 'movie', movieData.genres, tmdbLikeCredits, language, castCount, catalogChoices),
    app_extras: { cast: Utils.parseCast(tmdbLikeCredits, castCount) }
  };
}

async function buildTmdbMovieResponse(movieData, language, config, catalogChoices) {
  const { id: tmdbId, title, external_ids, poster_path, credits } = movieData;
  const imdbId = external_ids?.imdb_id;
  const castCount = config.castCount === 0 ? undefined : config.castCount;
  const [logoUrl, imdbRatingValue] = await Promise.all([
    getLogo('movie', { tmdbId }, language, movieData.original_language, config),
    getImdbRating(imdbId, 'movie')
  ]);
  const imdbRating = imdbRatingValue || movieData.vote_average?.toFixed(1) || "N/A";
  const fallbackPosterUrl = `https://image.tmdb.org/t/p/w500${poster_path}`;
  const posterProxyUrl = `${host}/poster/movie/tmdb:${movieData.id}?fallback=${encodeURIComponent(fallbackPosterUrl)}&lang=${language}&key=${config.apiKeys?.rpdb}`;
  //console.log(Utils.parseCast(credits, castCount));
  return {
    id: `tmdb:${tmdbId}`,
    type: 'movie',
    name: title,
    imdb_id: imdbId,
    slug: Utils.parseSlug('movie', title, null, `tmdb:${tmdbId}`),
    genres: Utils.parseGenres(movieData.genres),
    description: movieData.overview,
    director: Utils.parseDirector(credits).join(', '),
    writer: Utils.parseWriter(credits).join(', '),
    year: movieData.release_date ? movieData.release_date.substring(0, 4) : "",
    released: new Date(movieData.release_date),
    runtime: Utils.parseRunTime(movieData.runtime),
    country: Utils.parseCoutry(movieData.production_countries),
    imdbRating,
    poster: config.apiKeys?.rpdb ? posterProxyUrl : fallbackPosterUrl,
    background: `https://image.tmdb.org/t/p/original${movieData.backdrop_path}`,
    logo: processLogo(logoUrl),
    trailers: Utils.parseTrailers(movieData.videos),
    trailerStreams: Utils.parseTrailerStream(movieData.videos),
    links: Utils.buildLinks(imdbRating, imdbId, title, 'movie', movieData.genres, credits, language, castCount, catalogChoices),
    behaviorHints: { defaultVideoId: imdbId || `tmdb:${tmdbId}`, hasScheduledVideos: false },
    app_extras: { cast: Utils.parseCast(credits, castCount) }
  };
}

async function buildTmdbSeriesResponse(seriesData, language, config, catalogChoices, enrichmentData = {}) {
  const { id: tmdbId, name, external_ids, poster_path, backdrop_path, credits, videos: trailers, seasons } = seriesData;
  const { allIds } = enrichmentData;
  const imdbId = allIds?.imdbId;
  const tvdbId = allIds?.tvdbId;
  const kitsuId = allIds?.kitsuId;

  const [fanartUrl, logoUrl, imdbRatingValue] = await Promise.all([
    tvdbId ? fanart.getBestSeriesBackground(tvdbId, config) : Promise.resolve(null),
    getLogo('series', { tmdbId, tvdbId }, language, seriesData.original_language, config),
    imdbId ? getImdbRating(imdbId, 'series') : Promise.resolve(null)
  ]);
  
  const finalPosterUrl = poster_path ? `https://image.tmdb.org/t/p/w500${poster_path}` : null;
  const posterProxyUrl = `${host}/poster/series/tmdb:${tmdbId}?fallback=${encodeURIComponent(finalPosterUrl)}&lang=${language}&key=${config.apiKeys?.rpdb}`;
  const finalBackgroundUrl = fanartUrl || (backdrop_path ? `https://image.tmdb.org/t/p/original${backdrop_path}` : null);
  const imdbRating = imdbRatingValue || seriesData.vote_average?.toFixed(1) || "N/A";
  const castCount = config.castCount === 0 ? undefined : config.castCount;

  const seasonPromises = (seasons || [])
    .filter(season => season.season_number > 0 && season.episode_count > 0) 
    .map(season => moviedb.seasonInfo({ id: tmdbId, season_number: season.season_number, language }, config));
  
  const seasonDetails = await Promise.all(seasonPromises);
  
  const videos = seasonDetails.flatMap(season => 
    (season.episodes || []).map(ep => {
      const episodeId = imdbId ? `${imdbId}:${ep.season_number}:${ep.episode_number}` : null;
      if(kitsuId) {
        episodeId = `kitsu:${kitsuId}:1:${ep.episode_number}`;
      }
      if (!episodeId) return null;

      const thumbnailUrl = ep.still_path ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : finalPosterUrl;
      const finalThumbnail = config.blurThumbs && thumbnailUrl
        ? `${host}/api/image/blur?url=${encodeURIComponent(thumbnailUrl)}`
        : thumbnailUrl;
      
      return {
        id: episodeId,
        title: ep.name || `Episode ${ep.episode_number}`,
        season: ep.season_number,
        episode: ep.episode_number,
        released: ep.air_date ? new Date(ep.air_date).toISOString() : null,
        overview: ep.overview,
        thumbnail: finalThumbnail,
      };
    })
  ).filter(Boolean);

  return {
    id: `tmdb:${tmdbId}`,
    type: 'series',
    name: name,
    imdb_id: imdbId,
    slug: Utils.parseSlug('series', name, null, `tmdb:${tmdbId}`),
    genres: Utils.parseGenres(seriesData.genres),
    description: seriesData.overview,
    year: seriesData.first_air_date ? seriesData.first_air_date.substring(0, 4) : "",
    released: seriesData.first_air_date ? new Date(seriesData.first_air_date).toISOString() : null,
    runtime: seriesData.episode_run_time?.[0] ? `${seriesData.episode_run_time[0]}min` : null,
    status: seriesData.status,
    imdbRating,
    poster: config.apiKeys?.rpdb ? posterProxyUrl : finalPosterUrl,
    background: finalBackgroundUrl,
    logo: logoUrl,
    trailers: Utils.parseTrailers(trailers),
    links: Utils.buildLinks(imdbRating, imdbId, name, 'series', seriesData.genres, credits, language, castCount, catalogChoices),
    videos: videos,
    behaviorHints: {
      defaultVideoId: null,
      hasScheduledVideos: true,
    },
    app_extras: { cast: Utils.parseCast(credits, castCount) }
  };
}

async function buildTvdbSeriesResponse(tvdbShow, tvdbEpisodes, language, config, catalogChoices, enrichmentData = {}) {
  const { year, image: tvdbPosterPath, remoteIds, characters, episodes } = tvdbShow;
  const { allIds } = enrichmentData;
  const kitsuId = allIds?.kitsuId;
  const langCode = language.split('-')[0];
  const langCode3 = await to3LetterCode(langCode, config);
  const nameTranslations = tvdbShow.translations?.nameTranslations || [];
  const overviewTranslations = tvdbShow.translations?.overviewTranslations || [];
  const translatedName = nameTranslations.find(t => t.language === langCode3)?.name
             || nameTranslations.find(t => t.language === 'eng')?.name
             || tvdbShow.name;
             
  const overview = overviewTranslations.find(t => t.language === langCode3)?.overview
                   || overviewTranslations.find(t => t.language === 'eng')?.overview
                   || tvdbShow.overview;
  const imdbId = remoteIds?.find(id => id.sourceName === 'IMDB')?.id;
  const tmdbId = remoteIds?.find(id => id.sourceName === 'TheMovieDB.com')?.id;
  const tvdbId = tvdbShow.id;
  const castCount = config.castCount === 0 ? undefined : config.castCount;

  const [logoUrl, imdbRatingValue] = await Promise.all([
    getLogo('series', { tmdbId: tmdbId?.toString(), tvdbId: tvdbId?.toString() }, language, tvdbShow.originalLanguage, config),
    getImdbRating(imdbId, 'series')
  ]);
  const imdbRating = imdbRatingValue || "N/A";
  const fallbackPosterUrl = tvdbPosterPath ? `${tvdbPosterPath}` : `https://artworks.thetvdb.com/banners/images/missing/series.jpg`;
  const posterProxyUrl = `${host}/poster/series/tvdb:${tvdbShow.id}?fallback=${encodeURIComponent(fallbackPosterUrl)}&lang=${language}&key=${config.apiKeys?.rpdb}`;
  const tmdbLikeCredits = {
    cast: (characters || []).map(c => ({
      name: c.personName,
      character: c.name,
      profile_path: c.image 
    })),
    crew: []
  };

  const { trailers, trailerStreams } = Utils.parseTvdbTrailers(tvdbShow.trailers, translatedName);
  
  const videos = (tvdbEpisodes.episodes || [])
    .map(episode => {
        const thumbnailUrl = episode.image ? `${TVDB_IMAGE_BASE}${episode.image}` : null;
        const finalThumbnail = config.blurThumbs && thumbnailUrl
            ? `${host}/api/image/blur?url=${encodeURIComponent(thumbnailUrl)}`
            : thumbnailUrl;

        return {
            id: kitsuId ? `kitsu:${kitsuId}:1:${episode.number}` : `${imdbId || `tvdb${tvdbId}`}:${episode.seasonNumber}:${episode.number}`,
            title: episode.name || `Episode ${episode.number}`,
            season: episode.seasonNumber,
            episode: episode.number,
            thumbnail: finalThumbnail, 
            overview: episode.overview,
            released: episode.aired ? new Date(episode.aired) : null,
            available: episode.aired ? new Date(episode.aired) < new Date() : false,
        };
    });
 
  //console.log(tvdbShow.artworks?.find(a => a.type === 2)?.image);
  const meta = {
    id: `tvdb:${tvdbId}`,
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
    poster: config.apiKeys?.rpdb ? posterProxyUrl : fallbackPosterUrl,
    background: tvdbShow.artworks?.find(a => a.type === 3)?.image, 
    logo: processLogo(logoUrl),
    videos: videos,
    trailers: trailers,
    trailerStreams: trailerStreams,
    links: Utils.buildLinks(imdbRating, imdbId, translatedName, 'series', tvdbShow.genres, tmdbLikeCredits, language, castCount, catalogChoices),
    behaviorHints: { defaultVideoId: null, hasScheduledVideos: true },
    app_extras: { cast: Utils.parseCast(tmdbLikeCredits, castCount) }
  };
  //console.log(Utils.parseCast(tmdbLikeCredits, castCount));
  return meta;
}

async function buildSeriesResponseFromTvmaze(tvmazeShow, language, config, catalogChoices) {
  const { name, premiered, image, summary, externals } = tvmazeShow;
  const imdbId = externals.imdb;
  const tmdbId = externals.themoviedb;
  const tvdbId = externals.thetvdb;
  const castCount = config.castCount === 0 ? undefined : config.castCount;

  const [logoUrl, imdbRatingValue] = await Promise.all([
    getLogo('series', { tmdbId, tvdbId }, language, tvmazeShow.language, config),
    getImdbRating(imdbId, 'series')
  ]);
  const imdbRating = imdbRatingValue || tvmazeShow.rating?.average?.toFixed(1) || "N/A";

  const tmdbLikeCredits = {
    cast: (tvmazeShow?._embedded?.cast || []).map(c => ({
      name: c.person.name, character: c.character.name, profile_path: c.person.image?.medium.replace('https://static.tvmaze.com/uploads/images/', '')
    })),
    crew: (tvmazeShow?._embedded?.cast || []).filter(c => c.type === 'Creator').map(c => ({
        name: c.person.name, job: 'Creator'
    }))
  };

  const posterProxyUrl = `${host}/poster/series/${imdbId}?fallback=${encodeURIComponent(image?.original || '')}&lang=${language}&key=${config.apiKeys?.rpdb}`;

  const videos = (tvmazeShow?._embedded?.episodes || []).map(episode => ({
    id: `${imdbId}:${episode.season}:${episode.number}`,
    title: episode.name || `Episode ${episode.number}`,
    season: episode.season,
    episode: episode.number,
    thumbnail: config.blurThumbs && episode.image?.medium
      ? `${process.env.HOST_NAME}/api/image/blur?url=${encodeURIComponent(episode.image.medium)}`
      : episode.image?.medium || image?.medium,
    overview: episode.summary ? episode.summary.replace(/<[^>]*>?/gm, '') : '',
    released: new Date(episode.airstamp),
    available: new Date(episode.airstamp) < new Date(),
  }));

  const meta = {
    id: imdbId? imdbId : tvdbId ? `tvdb:${tvdbId}` : `tmdb:${tmdbId}`,
    type: 'series', 
    name: name, 
    imdb_id: imdbId,
    slug: Utils.parseSlug('series', name, imdbId),
    genres: tvmazeShow.genres || [],
    description: summary ? summary.replace(/<[^>]*>?/gm, '') : '',
    writer: Utils.parseWriter(tmdbLikeCredits).join(', '),
    year: Utils.parseYear(tvmazeShow.status, premiered, tvmazeShow.ended),
    released: new Date(premiered),
    runtime: tvmazeShow.runtime ? Utils.parseRunTime(tvmazeShow.runtime) : Utils.parseRunTime(tvmazeShow.averageRuntime),
    status: tvmazeShow.status,
    country: tvmazeShow.network?.country?.name || null,
    imdbRating,
    poster: config.apiKeys?.rpdb ? posterProxyUrl : image?.original, background: image?.original,
    logo: processLogo(logoUrl), videos,
    links: Utils.buildLinks(imdbRating, imdbId, name, 'series', tvmazeShow.genres.map(g => ({ name: g })), tmdbLikeCredits, language, castCount, catalogChoices),
    behaviorHints: { defaultVideoId: null, hasScheduledVideos: true },
  };

  return meta;
}


async function buildAnimeResponse(malData, language, characterData, episodeData, episodeVideoData, config, catalogChoices, enrichmentData = {}) {
  try {
    const { mapping, bestBackgroundUrl } = enrichmentData;
    const stremioType = malData.type.toLowerCase() === 'movie' ? 'movie' : 'series';
    const imdbId = mapping?.imdbId;
    const kitsuId = mapping?.kitsuId;
    const imdbRating = typeof malData.score === 'number' ? malData.score.toFixed(1) : "N/A";
    const castCount = config.castCount === 0 ? undefined : config.castCount;  
    let videos = [];
    const seriesId = `mal:${malData.mal_id}`;
    const idProvider = config.providers?.anime_id_provider || 'kitsu';
    let primaryId = seriesId; 
    if (idProvider === 'kitsu' && kitsuId) {
      primaryId = `kitsu:${kitsuId}`;
    }
    const posterUrl = malData.images?.jpg?.large_image_url;
    
    let finalPosterUrl = posterUrl; 

    if (config.apiKeys?.rpdb && mapping) {
      const tvdbId = mapping.tvdbId;
      const tmdbId = mapping.tmdbId;
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
        finalPosterUrl = `${host}/poster/${proxyType}/${proxyId}?fallback=${fallback}&lang=${language}&key=${config.apiKeys?.rpdb}`;
        console.log(`[buildAnimeResponse] Constructed RPDB Poster Proxy URL: ${finalPosterUrl}`);
      }
    }
    
    const thumbnailMap = new Map();
    if (episodeVideoData && episodeVideoData.length > 0) {
      episodeVideoData.forEach(video => {
        if (video.mal_id) {
          thumbnailMap.set(video.mal_id, video.images?.jpg?.image_url || null);
        }
      });
    }
    
    if (stremioType === 'series' && malData.status !== 'Not yet aired' && episodeData && episodeData.length > 0) {
      videos = (episodeData || [])
        .filter(ep => {
          if (config.mal?.skipFiller && ep.filler) {
            return false;
          }
          if (config.mal?.skipRecap && ep.recap) {
            return false;
          }
          return true;
        })
        .map(ep => {
          let episodeId = `${seriesId}:${ep.mal_id}`;
          if (idProvider === 'kitsu' && kitsuId) {
            episodeId = `kitsu:${kitsuId}:${ep.mal_id}`;
          }
         const thumbnailUrl = thumbnailMap.get(ep.mal_id) || posterUrl;
         return {
           id:  episodeId,
           title: ep.title,
           season: 1,
           episode: ep.mal_id,
           released: ep.aired? new Date(ep.aired) : null,
           thumbnail: config.blurThumbs? `${process.env.HOST_NAME}/api/image/blur?url=${encodeURIComponent(thumbnailUrl)}` : thumbnailUrl,
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
    const trailers = [];
    if (malData.trailer?.youtube_id) {
      trailers.push({
        source: malData.trailer.youtube_id,
        type: "Trailer",
        name: malData.title_english || malData.title
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
      trailers: trailers,
      trailerStreams: trailerStreams,
      behaviorHints: {
        defaultVideoId: stremioType === 'movie' ? ((kitsuId ? `kitsu:${kitsuId}` : null) || imdbId || seriesId) : null,
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
