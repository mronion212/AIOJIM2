require("dotenv").config();
const moviedb = require("./getTmdb");
const { getMeta } = require("./getMeta");
//const { isAnime } = require("../utils/isAnime");
//const { getGenreList } = require('./getGenreList');


async function getTrending(type, language, page, genre, config, catalogChoices) {
  try {
    const media_type = type === "series" ? "tv" : type;
    const time_window = genre && ['day', 'week'].includes(genre.toLowerCase()) ? genre.toLowerCase() : "day";
    
    const parameters = { media_type, time_window, language, page };
    //const genreList = await getGenreList(language, type);
    const res = await moviedb.trending(parameters, config);

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
    console.error(`Error fetching trending for type=${type}:`, error.message);
    return { metas: [] };
  }
}

module.exports = { getTrending };
