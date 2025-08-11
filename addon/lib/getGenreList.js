// lib/getGenreList.js

require('dotenv').config();
const moviedb = require("./getTmdb");
const { getAllGenres } = require('./tvdb');

/**
 * Fetches a list of genres from TMDB for building catalogs.
 *
 * @param {string} language - The language for the genre names (e.g., 'en-US').
 * @param {'movie'|'series'} type - The content type to fetch genres for.
 * @returns {Promise<Array<{id: number, name: string}>>} A list of genre objects, or an empty array on error.
 */
async function getGenreList(catalogType, language, type, config) {
  try {
    if (catalogType === 'tmdb') {
      if (type === "movie") {
        const res = await moviedb.genreMovieList({ language }, config);
        return res.genres || []; 
      } else {
        const res = await moviedb.genreTvList({ language }, config);
        return res.genres || [];
      }
    } else if (catalogType === 'tvdb') {
      const genres = await getAllGenres(config);
      return genres || [];
    }
  } catch (error) {
    console.error(`Error fetching ${type} genres from TMDB:`, error.message);
    return [];
  }
}

module.exports = { getGenreList };
