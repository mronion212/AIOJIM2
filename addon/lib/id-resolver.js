const idMapper = require('./id-mapper');
const tvdb = require('./tvdb'); 
const moviedb = require("./getTmdb");
const axios = require('axios');

async function resolveAllIds(stremioId, type, config) {
  console.log(`[ID Resolver] Resolving ${stremioId} (type: ${type})`);

  const allIds = { tmdbId: null, tvdbId: null, imdbId: null, malId: null, kitsuId: null };
  const [prefix, sourceId] = stremioId.split(':');

  if (prefix === 'tmdb') allIds.tmdbId = sourceId;
  if (prefix === 'tvdb') allIds.tvdbId = sourceId;
  if (prefix === 'mal') allIds.malId = sourceId;
  if (stremioId.startsWith('tt')) allIds.imdbId = stremioId;

  try {
    if (type === 'anime' && allIds.malId) {
      const mapping = idMapper.getMappingByMalId(allIds.malId);
      if (mapping) {
        //console.log(JSON.stringify(mapping));
        allIds.tmdbId = allIds.tmdbId || mapping.themoviedb_id;
        allIds.tvdbId = allIds.tvdbId || mapping.thetvdb_id;
        allIds.imdbId = allIds.imdbId || mapping.imdb_id;
        allIds.kitsuId = allIds.kitsuId || mapping.kitsu_id;
      }
    }

    if (allIds.tmdbId) {
      const details = type === 'movie'
        ? await moviedb.movieInfo({ id: allIds.tmdbId, append_to_response: 'external_ids' }, config)
        : await moviedb.tvInfo({ id: allIds.tmdbId, append_to_response: 'external_ids' }, config);
      
      allIds.imdbId = allIds.imdbId || details.external_ids?.imdb_id;
      allIds.tvdbId = allIds.tvdbId || details.external_ids?.tvdb_id;
    }

    if (allIds.imdbId && (!allIds.tmdbId || !allIds.tvdbId || !allIds.malId)) {
      // get external IDs from Cinemeta
      const externalIds = await getExternalIdsFromImdb(allIds.imdbId, type);
      if (externalIds) {
        allIds.tmdbId = allIds.tmdbId || externalIds.tmdbId;
        allIds.tvdbId = allIds.tvdbId || externalIds.tvdbId;
      }
      if (!allIds.tmdbId) {
        const findResults = await moviedb.find({ id: allIds.imdbId, external_source: 'imdb_id' }, config);
        const match = findResults.movie_results?.[0] || findResults.tv_results?.[0];
        if (match) allIds.tmdbId = match.id;
      }
      
      if (!allIds.tvdbId) {
        const tvdbMatch = await tvdb.findByImdbId(allIds.imdbId, config);
        //console.log(tvdbMatch);
        if (tvdbMatch) allIds.tvdbId = type === 'movie' ? tvdbMatch.movie.id : tvdbMatch.series.id;
      }
      if (!allIds.malId) {
        const malMatch = idMapper.getMappingByImdbId(allIds.imdbId);
        if (malMatch) allIds.malId = malMatch.mal_id;
      }
    }
    
    if (allIds.tvdbId && (!allIds.imdbId || !allIds.tmdbId)) {
        const tvdbDetails = type === 'movie' 
            ? await tvdb.getMovieExtended(allIds.tvdbId, config) 
            : await tvdb.getSeriesExtended(allIds.tvdbId, config);
        
        allIds.imdbId = allIds.imdbId || tvdbDetails.remoteIds?.find(id => id.sourceName === 'IMDB')?.id;
        allIds.tmdbId = allIds.tmdbId || tvdbDetails.remoteIds?.find(id => id.sourceName === 'TheMovieDB.com')?.id;
    }

  } catch (error) {
    console.warn(`[ID Resolver] API bridging failed for ${stremioId}: ${error.message}`);
  }

  console.log(`[ID Resolver] Final IDs:`, allIds);
  return allIds;
}

async function getExternalIdsFromImdb(imdbId, type) {
  if (!imdbId) {
    return undefined;
  }

  const url = `https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json`;
  try {
    const response = await axios.get(url);
    const tvdbId = response.data?.meta?.tvdb_id;
    const tmdbId = response.data?.meta?.moviedb_id;
    return {
      tmdbId: tmdbId || null,
      tvdbId: tvdbId || null
    };

  } catch (error) {
    console.warn(`Could not fetch external ids for ${imdbId} from Cinemeta for type ${type}. Error: ${error.message}`);
    return undefined;
  }
}


module.exports = { resolveAllIds };
