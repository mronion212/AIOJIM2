require("dotenv").config();
const axios = require('axios');


const FANART_API_KEY = process.env.FANART_API;

const FANART_API_BASE = 'http://webservice.fanart.tv/v3';

const fanartClient = axios.create({
  baseURL: FANART_API_BASE,
  timeout: 7000, 
  params: {
    api_key: FANART_API_KEY, 
  },
});


async function getBestSeriesBackground(tvdbId) {
  if (!FANART_API_KEY || !tvdbId) {
    return null;
  }

  try {
    const response = await fanartClient.get(`/tv/${tvdbId}`);
    const data = response.data;

    if (!data.showbackground || data.showbackground.length === 0) {
      console.log(`[Fanart] No showbackgrounds found for TVDB ID ${tvdbId}.`);
      return null;
    }

    const sortedBackgrounds = data.showbackground.sort((a, b) => parseInt(b.likes) - parseInt(a.likes));
    return sortedBackgrounds[0].url;

  } catch (error) {
    if (error.response && error.response.status === 404) {
      console.log(`[Fanart] No entry found on Fanart.tv for TVDB ID ${tvdbId}.`);
    } else {
      console.error(`[Fanart] Error fetching data for TVDB ID ${tvdbId}:`, error.message);
    }
    return null;
  }
}


async function getBestMovieBackground(tmdbId) {
  if (!FANART_API_KEY || !tmdbId) {
    return null;
  }

  try {
    const response = await fanartClient.get(`/movies/${tmdbId}`);
    const data = response.data;

    if (!data.moviebackground || data.moviebackground.length === 0) {
      console.log(`[Fanart] No moviebackgrounds found for TMDB ID ${tmdbId}.`);
      return null;
    }

    const sortedBackgrounds = data.moviebackground.sort((a, b) => parseInt(b.likes) - parseInt(a.likes));
    return sortedBackgrounds[0].url;
    
  } catch (error) {
    if (error.response && error.response.status === 404) {
      console.log(`[Fanart] No entry found on Fanart.tv for TMDB ID ${tmdbId}.`);
    } else {
      console.error(`[Fanart] Error fetching data for TMDB ID ${tmdbId}:`, error.message);
    }
    return null;
  }
}

module.exports = {
  getBestSeriesBackground,
  getBestMovieBackground,
};
