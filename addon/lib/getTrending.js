require("dotenv").config();
const moviedb = require("./getTmdb");
const Utils = require('../utils/parseProps');
const { resolveAllIds } = require('./id-resolver');
//const { isAnime } = require("../utils/isAnime");
//const { getGenreList } = require('./getGenreList');

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

const host = process.env.HOST_NAME.startsWith('http')
    ? process.env.HOST_NAME
    : `https://${process.env.HOST_NAME}`;

async function getTrending(type, language, page, genre, config, catalogChoices) {
  try {
    console.log(`[getTrending] Fetching trending for type=${type}, language=${language}, page=${page}, genre=${genre}`);
    const media_type = type === "series" ? "tv" : type;
    const time_window = genre && ['day', 'week'].includes(genre.toLowerCase()) ? genre.toLowerCase() : "day";
    
    const parameters = { media_type, time_window, language, page };
    //const genreList = await getGenreList(language, type);
    const res = await moviedb.trending(parameters, config);

    const metas = await Promise.all(res.results.map(async item => {
      // Determine preferred meta provider
      let preferredProvider;
      if (type === 'movie') {
        preferredProvider = config.providers?.movie || 'tmdb';
      } else {
        preferredProvider = config.providers?.series || 'tvdb';
      }
      const allIds = await resolveAllIds(`tmdb:${item.id}`, type, config);
      let stremioId;
      if (preferredProvider === 'tvdb' && allIds.tvdbId) {
        stremioId = `tvdb:${allIds.tvdbId}`;
      } else if (preferredProvider === 'tmdb' && allIds.tmdbId) {
        stremioId = `tmdb:${allIds.tmdbId}`;
      } else if (preferredProvider === 'imdb' && allIds.imdbId) {
        stremioId = allIds.imdbId;
      } else {
        stremioId = `tmdb:${item.id}`; // fallback
      }
      const tmdbPosterFullUrl = item.poster_path
        ? `${TMDB_IMAGE_BASE}${item.poster_path}`
        : `https://artworks.thetvdb.com/banners/images/missing/series.jpg`;
      let posterUrl;
      if (type === 'movie') {
        posterUrl = await Utils.getMoviePoster({
          tmdbId: allIds.tmdbId,
          tvdbId: allIds.tvdbId,
          imdbId: allIds.imdbId,
          metaProvider: preferredProvider,
          fallbackPosterUrl: tmdbPosterFullUrl
        }, config);
      } else {
        posterUrl = await Utils.getSeriesPoster({
          tmdbId: allIds.tmdbId,
          tvdbId: allIds.tvdbId,
          imdbId: allIds.imdbId,
          metaProvider: preferredProvider,
          fallbackPosterUrl: tmdbPosterFullUrl
        }, config);
      }
      const posterProxyUrl = `${host}/poster/${type}/${stremioId}?fallback=${encodeURIComponent(posterUrl)}&lang=${language}&key=${config.apiKeys?.rpdb}`;
      return {
        id: stremioId,
        type: type,
        name: item.title || item.name,
        poster: posterProxyUrl,
        year: (item.release_date || item.first_air_date || '').substring(0, 4),
      };
    }));

    return { metas };

  } catch (error) {
    console.error(`Error fetching trending for type=${type}:`, error.message);
    return { metas: [] };
  }
}

module.exports = { getTrending };
