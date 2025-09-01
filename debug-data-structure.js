const axios = require('axios');
const xml2js = require('xml2js');
const { initializeAnimeListMapper } = require('./addon/lib/anime-list-mapper');

async function debugDataStructure() {
  console.log('=== Debugging Data Structure Differences ===');
  
  try {
    // Method 1: Direct URL approach
    console.log('\n--- Direct URL Approach ---');
    const response = await axios.get('https://raw.githubusercontent.com/Anime-Lists/anime-lists/refs/heads/master/anime-list-full.xml', {
      timeout: 30000,
      maxRedirects: 5,
      validateStatus: () => true
    });
    
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(response.data);
    
    const directEntries = result['anime-list'].anime.filter(anime => 
      anime.$.tvdbid === '74796'
    );
    
    console.log(`Direct URL: Found ${directEntries.length} entries`);
    
    // Check the first entry (Bleach with absolute numbering)
    const bleachEntry = directEntries.find(entry => entry.$.anidbid === '2369');
    if (bleachEntry) {
      console.log('Direct URL - Bleach entry structure:');
      console.log(`  defaulttvdbseason: ${bleachEntry.$.defaulttvdbseason}`);
      console.log(`  has mapping-list: ${!!bleachEntry['mapping-list']}`);
      if (bleachEntry['mapping-list']) {
        console.log(`  mapping-list type: ${typeof bleachEntry['mapping-list']}`);
        console.log(`  mapping-list isArray: ${Array.isArray(bleachEntry['mapping-list'])}`);
        if (Array.isArray(bleachEntry['mapping-list']) && bleachEntry['mapping-list'].length > 0) {
          const mappings = bleachEntry['mapping-list'][0].mapping;
          console.log(`  mappings type: ${typeof mappings}`);
          console.log(`  mappings isArray: ${Array.isArray(mappings)}`);
          console.log(`  number of mappings: ${Array.isArray(mappings) ? mappings.length : 'N/A'}`);
        }
      }
    }
    
    // Method 2: Anime-list mapper approach
    console.log('\n--- Anime-list Mapper Approach ---');
    await initializeAnimeListMapper();
    
    const mapperEntries = require('./addon/lib/anime-list-mapper').getAnimeByTvdbId(74796);
    console.log(`Anime-list Mapper: Found ${mapperEntries.length} entries`);
    
    // Check the first entry
    if (mapperEntries.length > 0) {
      const mapperBleachEntry = mapperEntries.find(entry => entry.$.anidbid === '2369');
      if (mapperBleachEntry) {
        console.log('Anime-list Mapper - Bleach entry structure:');
        console.log(`  defaulttvdbseason: ${mapperBleachEntry.$.defaulttvdbseason}`);
        console.log(`  has mapping-list: ${!!mapperBleachEntry['mapping-list']}`);
        if (mapperBleachEntry['mapping-list']) {
          console.log(`  mapping-list type: ${typeof mapperBleachEntry['mapping-list']}`);
          console.log(`  mapping-list isArray: ${Array.isArray(mapperBleachEntry['mapping-list'])}`);
          if (Array.isArray(mapperBleachEntry['mapping-list']) && mapperBleachEntry['mapping-list'].length > 0) {
            const mappings = mapperBleachEntry['mapping-list'][0].mapping;
            console.log(`  mappings type: ${typeof mappings}`);
            console.log(`  mappings isArray: ${Array.isArray(mappings)}`);
            console.log(`  number of mappings: ${Array.isArray(mappings) ? mappings.length : 'N/A'}`);
          }
        }
      }
    }
    
    // Compare the structures
    console.log('\n--- Structure Comparison ---');
    if (bleachEntry && mapperBleachEntry) {
      console.log('Direct URL mapping-list structure:');
      console.log(JSON.stringify(bleachEntry['mapping-list'], null, 2));
      
      console.log('\nAnime-list Mapper mapping-list structure:');
      console.log(JSON.stringify(mapperBleachEntry['mapping-list'], null, 2));
    }
    
  } catch (error) {
    console.error('Debug failed:', error);
  }
}

debugDataStructure();
