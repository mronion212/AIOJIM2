const { initializeAnimeListMapper } = require('./addon/lib/anime-list-mapper');

async function debugMap() {
  console.log('=== Debugging TVDB ID Storage ===');
  
  try {
    // Initialize the mapper
    console.log('Initializing anime list mapper...');
    await initializeAnimeListMapper();
    
    // Get the map directly
    const tvdbToAnimeMap = require('./addon/lib/anime-list-mapper').tvdbToAnimeMap();
    
    console.log(`Total TVDB IDs in map: ${tvdbToAnimeMap.size}`);
    
    // Check if 74796 exists as different types
    const has74796String = tvdbToAnimeMap.has('74796');
    const has74796Number = tvdbToAnimeMap.has(74796);
    
    console.log(`Has TVDB ID "74796" (string): ${has74796String}`);
    console.log(`Has TVDB ID 74796 (number): ${has74796Number}`);
    
    if (has74796String) {
      const entries = tvdbToAnimeMap.get('74796');
      console.log(`Found ${entries.length} entries for string "74796":`);
      entries.forEach((entry, i) => {
        console.log(`  Entry ${i + 1}: AniDB ${entry.$.anidbid}, Name: ${entry.name}, Default Season: ${entry.$.defaulttvdbseason}`);
      });
    }
    
    if (has74796Number) {
      const entries = tvdbToAnimeMap.get(74796);
      console.log(`Found ${entries.length} entries for number 74796:`);
      entries.forEach((entry, i) => {
        console.log(`  Entry ${i + 1}: AniDB ${entry.$.anidbid}, Name: ${entry.name}, Default Season: ${entry.$.defaulttvdbseason}`);
      });
    }
    
    // Show some sample keys
    const keys = Array.from(tvdbToAnimeMap.keys()).slice(0, 10);
    console.log('Sample TVDB ID keys:', keys);
    console.log('Sample key types:', keys.map(k => typeof k));
    
  } catch (error) {
    console.error('Debug failed:', error);
  }
}

debugMap();
