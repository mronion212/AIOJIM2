const idMapper = require('./id-mapper');
const tvdb = require('./tvdb'); 
const moviedb = require("./getTmdb");

async function resolveAllIds(stremioId, type, config) {
  console.log(`[ID Resolver] Resolving ${stremioId} (type: ${type})`);

  const allIds = { tmdbId: null, tvdbId: null, imdbId: null, malId: null, kitsuId: null };
  const [prefix, sourceId] = stremioId.split(':');

  if (prefix === 'tmdb') allIds.tmdbId = sourceId;
  if (prefix === 'tvdb') allIds.tvdbId = sourceId;
  if (prefix === 'mal') allIds.malId = sourceId;
  if (prefix === 'tt') allIds.imdbId = stremioId;

  try {
    if (type === 'anime' && allIds.malId) {
      const mapping = idMapper.getMappingByMalId(allIds.malId);
      if (mapping) {
        console.log(JSON.stringify(mapping));
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

    if (allIds.imdbId && (!allIds.tmdbId || !allIds.tvdbId)) {
      
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

module.exports = { resolveAllIds };
