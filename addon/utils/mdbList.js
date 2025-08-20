const axios = require("axios");
const { it } = require("node:test");
const { resolveAllIds } = require("../lib/id-resolver");
const Utils = require("./parseProps");

const host = process.env.HOST_NAME.startsWith('http')
    ? process.env.HOST_NAME
    : `https://${process.env.HOST_NAME}`;

async function fetchMDBListItems(listId, apiKey, language, page) {
    const offset = (page * 20) - 20;
  try {
    const url = `https://api.mdblist.com/lists/${listId}/items?language=${language}&limit=20&offset=${offset}&apikey=${apiKey}&append_to_response=genre,poster`;
    const response = await axios.get(url);
    return [
      ...(response.data.movies || []),
      ...(response.data.shows || [])
    ];
  } catch (err) {
    console.error("Error retrieving MDBList items:", err.message);
    return [];
  }
}

async function getGenresFromMDBList(listId, apiKey) {
  try {
    const items = await fetchMDBListItems(listId, apiKey, 'en-US', 1);
    const genres = [
      ...new Set(
        items.flatMap(item =>
          (item.genre || []).map(g => {
            if (!g || typeof g !== "string") return null;
            return g.charAt(0).toUpperCase() + g.slice(1).toLowerCase();
          })
        ).filter(Boolean)
      )
    ].sort();
    return genres;
  } catch(err) {
    console.error("ERROR in getGenresFromMDBList:", err);
    return [];
  }
}


async function parseMDBListItems(items, type, genreFilter, language, config) {
  let filteredItems = items;
  if (genreFilter) {
    filteredItems = filteredItems.filter(item =>
      Array.isArray(item.genre) &&
      item.genre.some(g => typeof g === "string" && g.toLowerCase() === genreFilter.toLowerCase())
    );
  }

  const targetMediaType = type === 'series' ? 'show' : 'movie';

  const metas = await Promise.all(filteredItems
    .filter(item => item.mediatype === targetMediaType)
    .map(async item => {
      try {
        const allIds = await resolveAllIds(`tmdb:${item.id}`, type, config);
        let preferredProvider;
        if (type === 'movie') {
          preferredProvider = config.providers?.movie || 'tmdb';
        } else {
          preferredProvider = config.providers?.series || 'tvdb';
        }
        let stremioId;
        if (preferredProvider === 'tvdb' && allIds.tvdbId) {
          stremioId = `tvdb:${allIds.tvdbId}`;
        } else if (preferredProvider === 'tmdb' && allIds.tmdbId) {
          stremioId = `tmdb:${item.id}`;
        } else if (preferredProvider === 'imdb' && allIds.imdbId) {
          stremioId = allIds.imdbId;
        } else {
          stremioId = `tmdb:${item.id}`;
        }
        const tmdbPosterFullUrl = item.poster ? `https://image.tmdb.org/t/p/w500${item.poster}` : `https://artworks.thetvdb.com/banners/images/missing/${type}.jpg`;
        let posterUrl;
        if (type === 'movie') {
          posterUrl = await Utils.getMoviePoster({
            tmdbId: item.id,
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
          year: item.release_year || null
        };
      } catch (error) {
        console.error(`[MDBList] Error resolving IDs for item ${item.id}:`, error.message);
        const fallbackPosterUrl = item.poster ? `https://image.tmdb.org/t/p/w500${item.poster}` : `https://artworks.thetvdb.com/banners/images/missing/${type}.jpg`;
        const posterProxyUrl = `${host}/poster/${type}/tmdb:${item.id}?fallback=${encodeURIComponent(fallbackPosterUrl)}&lang=${language}&key=${config.apiKeys?.rpdb}`;

        return {
          id: `tmdb:${item.id}`,
          type: type,
          name: item.title || item.name,
          poster: posterProxyUrl,
          year: item.release_year || null
        };
      }
    }));

  return metas.filter(Boolean);
}

module.exports = { fetchMDBListItems, getGenresFromMDBList, parseMDBListItems };
