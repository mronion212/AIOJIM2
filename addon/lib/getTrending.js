require("dotenv").config();
const moviedb = require("./getTmdb");
//const { isAnime } = require("../utils/isAnime");
//const { getGenreList } = require('./getGenreList');

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

const host = process.env.HOST_NAME.startsWith('http')
    ? process.env.HOST_NAME
    : `https://${process.env.HOST_NAME}`;

async function getTrending(type, language, page, genre, config, catalogChoices) {
  try {
    const media_type = type === "series" ? "tv" : type;
    const time_window = genre && ['day', 'week'].includes(genre.toLowerCase()) ? genre.toLowerCase() : "day";
    
    const parameters = { media_type, time_window, language, page };
    //const genreList = await getGenreList(language, type);
    const res = await moviedb.trending(parameters, config);

    const metas = res.results.map(item => {
      const tmdbPosterFullUrl = item.poster_path
            ? `${TMDB_IMAGE_BASE}${item.poster_path}`
            : `https://artworks.thetvdb.com/banners/images/missing/series.jpg`; 

    const posterProxyUrl = `${host}/poster/${type}/tmdb:${item.id}?fallback=${encodeURIComponent(tmdbPosterFullUrl)}&lang=${language}&key=${config.apiKeys?.rpdb}`;
      return {
        id: `tmdb:${item.id}`,
        type: type,
        name: item.title || item.name,
        poster: posterProxyUrl,
        year: (item.release_date || item.first_air_date || '').substring(0, 4),
      };
    });

    return { metas };

  } catch (error) {
    console.error(`Error fetching trending for type=${type}:`, error.message);
    return { metas: [] };
  }
}

module.exports = { getTrending };
