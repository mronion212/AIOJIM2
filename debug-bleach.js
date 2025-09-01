const axios = require('axios');
const xml2js = require('xml2js');

async function debugBleach() {
  console.log('=== Debugging Bleach (TVDB ID 74796) ===');
  
  try {
    // Directly fetch the XML file
    console.log('Fetching anime-list XML directly...');
    const response = await axios.get('https://raw.githubusercontent.com/Anime-Lists/anime-lists/refs/heads/master/anime-list-full.xml', {
      timeout: 30000,
      maxRedirects: 5,
      validateStatus: () => true
    });
    
    if (response.status !== 200) {
      throw new Error(`Failed to fetch XML: ${response.status}`);
    }
    
    console.log('Parsing XML...');
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(response.data);
    
    // Find all anime entries for TVDB ID 74796
    const animeEntries = result['anime-list'].anime.filter(anime => 
      anime.$.tvdbid === '74796'
    );
    
    console.log(`Found ${animeEntries.length} anime entries for TVDB ID 74796:`);
    
    animeEntries.forEach((entry, index) => {
      console.log(`\nEntry ${index + 1}:`);
      console.log(`  AniDB ID: ${entry.$.anidbid}`);
      console.log(`  Name: ${entry.name}`);
      console.log(`  Default TVDB Season: ${entry.$.defaulttvdbseason}`);
      console.log(`  Episode Offset: ${entry.$.episodeoffset || 'none'}`);
      
      if (entry['mapping-list'] && entry['mapping-list'][0]) {
        console.log(`  Has mapping-list: yes`);
        const mappingList = entry['mapping-list'][0];
        const mappings = mappingList.mapping || [];
        console.log(`  Number of mappings: ${Array.isArray(mappings) ? mappings.length : 1}`);
        
        // Show mapping details
        if (Array.isArray(mappings)) {
          mappings.forEach((mapping, i) => {
            console.log(`    Mapping ${i + 1}: anidbseason=${mapping.$.anidbseason}, tvdbseason=${mapping.$.tvdbseason}`);
            if (mapping.$.start && mapping.$.end) {
              console.log(`      Range: ${mapping.$.start}-${mapping.$.end}, offset: ${mapping.$.offset || 'none'}`);
            }
            if (mapping._) {
              console.log(`      Episode mapping: ${mapping._}`);
            }
          });
        } else {
          console.log(`    Mapping: anidbseason=${mappings.$.anidbseason}, tvdbseason=${mappings.$.tvdbseason}`);
          if (mappings.$.start && mappings.$.end) {
            console.log(`      Range: ${mappings.$.start}-${mappings.$.end}, offset: ${mappings.$.offset || 'none'}`);
          }
          if (mappings._) {
            console.log(`      Episode mapping: ${mappings._}`);
          }
        }
      } else {
        console.log(`  Has mapping-list: no`);
      }
    });
    
    // Test manual resolution for specific episodes
    console.log('\n=== Manual Resolution Testing ===');
    
    // Test Season 1 Episode 1 (should use absolute numbering)
    console.log('\nTesting S1E1:');
    const s1e1Entry = animeEntries.find(entry => entry.$.defaulttvdbseason === 'a');
    if (s1e1Entry) {
      console.log('Found absolute numbering entry:', s1e1Entry.name);
      // Find mapping for season 1
      const mappingList = s1e1Entry['mapping-list']?.[0];
      const season1Mapping = mappingList?.mapping?.find(m => 
        m.$.tvdbseason === '1'
      );
      if (season1Mapping) {
        console.log('Season 1 mapping found:', season1Mapping);
        if (season1Mapping.$.start && season1Mapping.$.end) {
          const start = parseInt(season1Mapping.$.start);
          const end = parseInt(season1Mapping.$.end);
          const offset = parseInt(season1Mapping.$.offset) || 0;
          
          if (1 >= start && 1 <= end) {
            const anidbEpisode = 1 - offset;
            console.log(`✅ S1E1 → AniDB Episode ${anidbEpisode} (AniDB ID: ${s1e1Entry.$.anidbid})`);
          } else {
            console.log('❌ Episode 1 not in range');
          }
        }
      } else {
        console.log('❌ No season 1 mapping found');
      }
    } else {
      console.log('❌ No absolute numbering entry found');
    }
    
    // Test Season 2 Episode 1 (should use absolute numbering with offset)
    console.log('\nTesting S2E1:');
    if (s1e1Entry) {
      const mappingList = s1e1Entry['mapping-list']?.[0];
      const season2Mapping = mappingList?.mapping?.find(m => 
        m.$.tvdbseason === '2'
      );
      if (season2Mapping) {
        console.log('Season 2 mapping found:', season2Mapping);
        if (season2Mapping.$.start && season2Mapping.$.end) {
          const start = parseInt(season2Mapping.$.start);
          const end = parseInt(season2Mapping.$.end);
          const offset = parseInt(season2Mapping.$.offset) || 0;
          
          if (1 >= start && 1 <= end) {
            const anidbEpisode = 1 - offset;
            console.log(`✅ S2E1 → AniDB Episode ${anidbEpisode} (AniDB ID: ${s1e1Entry.$.anidbid})`);
          } else {
            console.log('❌ Episode 1 not in range');
          }
        }
      } else {
        console.log('❌ No season 2 mapping found');
      }
    }
    
    // Test Season 17 Episode 1 (should use regular season mapping)
    console.log('\nTesting S17E1:');
    const s17Entry = animeEntries.find(entry => entry.$.defaulttvdbseason === '17');
    if (s17Entry) {
      console.log('Found season 17 entry:', s17Entry.name);
      const episodeOffset = parseInt(s17Entry.$.episodeoffset) || 0;
      const anidbEpisode = 1 - episodeOffset;
      console.log(`✅ S17E1 → AniDB Episode ${anidbEpisode} (AniDB ID: ${s17Entry.$.anidbid})`);
    } else {
      console.log('❌ No season 17 entry found');
    }
    
  } catch (error) {
    console.error('Debug failed:', error);
  }
}

debugBleach();
