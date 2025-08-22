// lib/cacheWarmer.js

const { cacheWrapGlobal, cacheWrapJikanApi } = require('./getCache');
const { getGenreList } = require('./getGenreList');
const mal = require('./mal');

// Warming strategies
const WARMING_STRATEGIES = {
  ESSENTIAL: 'essential',
  RELATED: 'related',
  USER_ACTIVITY: 'user_activity'
};

/**
 * Warm essential content that users commonly access
 */
async function warmEssentialContent() {
  try {
    console.log('[Cache Warming] Warming essential content...');
    
    // Warm TMDB genres
    await getGenreList('tmdb', 'en-US', 'movie', {});
    await getGenreList('tmdb', 'en-US', 'series', {});
    
    // Warm TVDB genres
    await getGenreList('tvdb', 'en-US', 'series', {});
    
    // Warm MAL genres
    await cacheWrapJikanApi('anime-genres', async () => {
      return await mal.getAnimeGenres();
    });
    
    // Warm MAL studios
    await cacheWrapJikanApi('mal-studios', async () => {
      return await mal.getStudios(100);
    });
    
    console.log('[Cache Warming] Essential content warming completed');
  } catch (error) {
    console.error('[Cache Warming] Error warming essential content:', error.message);
  }
}

/**
 * Warm related content based on popular items
 */
async function warmRelatedContent() {
  try {
    console.log('[Cache Warming] Warming related content...');
    
    // This could be expanded to warm content based on popular movies/series
    // For now, just log that it's called
    
    console.log('[Cache Warming] Related content warming completed');
  } catch (error) {
    console.error('[Cache Warming] Error warming related content:', error.message);
  }
}

/**
 * Warm content based on user activity patterns
 */
async function warmFromUserActivity() {
  try {
    console.log('[Cache Warming] Warming content from user activity...');
    
    // This could analyze user activity logs and warm frequently accessed content
    // For now, just log that it's called
    
    console.log('[Cache Warming] User activity warming completed');
  } catch (error) {
    console.error('[Cache Warming] Error warming from user activity:', error.message);
  }
}

/**
 * Schedule essential warming at regular intervals
 */
function scheduleEssentialWarming(intervalMinutes = 30) {
  console.log(`[Cache Warming] Scheduling essential warming every ${intervalMinutes} minutes`);
  
  // Run initial warming
  warmEssentialContent();
  
  // Schedule recurring warming
  const intervalMs = intervalMinutes * 60 * 1000;
  setInterval(() => {
    console.log('[Cache Warming] Running scheduled essential warming...');
    warmEssentialContent();
  }, intervalMs);
}

module.exports = {
  warmEssentialContent,
  warmRelatedContent,
  warmFromUserActivity,
  scheduleEssentialWarming,
  WARMING_STRATEGIES
};
