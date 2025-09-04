const os = require('os');
const process = require('process');
const requestTracker = require('./requestTracker');

class DashboardAPI {
  constructor(cache, idMapper, config, database) {
    this.cache = cache || null;
    this.idMapper = idMapper || null;
    this.config = config || {};
    this.database = database || null;
    this.startTime = Date.now();
    
    // Initialize persistent uptime tracking
    this.initializePersistentUptime();
  }

  // Initialize persistent uptime tracking in Redis
  async initializePersistentUptime() {
    try {
      if (this.cache) {
        const existingStartTime = await this.cache.get('addon:start_time');
        if (!existingStartTime) {
          // First time startup - store current time
          await this.cache.set('addon:start_time', Date.now().toString());
          console.log('[Dashboard API] Initialized persistent uptime tracking');
        }
      }
    } catch (error) {
      console.warn('[Dashboard API] Failed to initialize persistent uptime:', error.message);
    }
  }

  // Get persistent uptime (survives process restarts)
  async getPersistentUptime() {
    try {
      if (this.cache) {
        const startTimeStr = await this.cache.get('addon:start_time');
        if (startTimeStr) {
          const startTime = parseInt(startTimeStr);
          const uptimeMs = Date.now() - startTime;
          const uptimeSeconds = Math.floor(uptimeMs / 1000);
          
          const hours = Math.floor(uptimeSeconds / 3600);
          const minutes = Math.floor((uptimeSeconds % 3600) / 60);
          
          return {
            uptime: `${hours}h ${minutes}m`,
            uptimeSeconds,
            startTime: new Date(startTime).toISOString()
          };
        }
      }
      
      // Fallback to process uptime
      const processUptime = process.uptime();
      const hours = Math.floor(processUptime / 3600);
      const minutes = Math.floor((processUptime % 3600) / 60);
      
      return {
        uptime: `${hours}h ${minutes}m`,
        uptimeSeconds: Math.floor(processUptime),
        startTime: new Date(Date.now() - processUptime * 1000).toISOString()
      };
    } catch (error) {
      console.warn('[Dashboard API] Failed to get persistent uptime:', error.message);
      return {
        uptime: '0h 0m',
        uptimeSeconds: 0,
        startTime: new Date().toISOString()
      };
    }
  }

  // Get system overview data
  async getSystemOverview() {
    // Get persistent uptime (survives restarts)
    const persistentUptime = await this.getPersistentUptime();
    
    // Get process uptime for comparison
    const processUptime = process.uptime();
    const processHours = Math.floor(processUptime / 3600);
    const processMinutes = Math.floor((processUptime % 3600) / 60);
    
    // Get system uptime
    const systemUptime = os.uptime();
    const systemHours = Math.floor(systemUptime / 3600);
    const systemMinutes = Math.floor((systemUptime % 3600) / 60);
    
    return {
      status: 'healthy', // TODO: Implement health check
      uptime: persistentUptime.uptime, // Use persistent uptime
      uptimeSeconds: persistentUptime.uptimeSeconds,
      processUptime: `${processHours}h ${processMinutes}m`, // Show process uptime separately
      systemUptime: `${systemHours}h ${systemMinutes}m`,
      version: process.env.npm_package_version || '1.0.0-beta.22.1.0',
      lastUpdate: new Date().toLocaleString(),
      memoryUsage: process.memoryUsage(),
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      processId: process.pid,
      startTime: persistentUptime.startTime
    };
  }

  // Get quick statistics
  async getQuickStats() {
    try {
      // Get real request tracking data
      const requestStats = await requestTracker.getStats();
      const activeUsers = await requestTracker.getActiveUsers();
      
      // Get real cache hit rate from request tracker
      const cacheHitRate = await requestTracker.getCacheHitRate();
      
      return {
        totalRequests: requestStats.totalRequests,
        cacheHitRate: cacheHitRate,
        activeUsers: activeUsers,
        errorRate: parseFloat(requestStats.errorRate)
      };
    } catch (error) {
      console.error('[Dashboard API] Error getting quick stats:', error);
      return {
        totalRequests: 0,
        cacheHitRate: 0,
        activeUsers: 0,
        errorRate: 0
      };
    }
  }

  // Get cache performance data
  async getCachePerformance() {
    try {
      if (this.cache) {
        // Get real Redis cache stats
        try {
          const keys = await this.cache.keys('*');
          const cacheHitRate = await requestTracker.getCacheHitRate();
          
          // Get real Redis memory usage
          let memoryUsage = 0;
          try {
            const info = await this.cache.info('memory');
            const lines = info.split('\r\n');
            let usedMemory = 0;
            let maxMemory = 0;
            
            for (const line of lines) {
              if (line.startsWith('used_memory:')) {
                usedMemory = parseInt(line.split(':')[1]);
              } else if (line.startsWith('maxmemory:')) {
                maxMemory = parseInt(line.split(':')[1]);
              }
            }
            
            if (maxMemory > 0) {
              memoryUsage = Math.round((usedMemory / maxMemory) * 100);
            } else {
              // If no max memory is set, use used memory as a percentage of 1GB as reference
              const referenceMemory = 1024 * 1024 * 1024; // 1GB
              memoryUsage = Math.min(Math.round((usedMemory / referenceMemory) * 100), 100);
            }
          } catch (memError) {
            console.warn('[Dashboard API] Failed to get Redis memory info:', memError.message);
            memoryUsage = 0;
          }
          
          const hitRate = Number(cacheHitRate) || 0;
          const missRate = hitRate > 0 ? 100 - hitRate : 0;
          
          return {
            hitRate: hitRate,
            missRate: missRate,
            memoryUsage: memoryUsage,
            evictionRate: 2.1, // TODO: Calculate real eviction rate from Redis stats
            totalKeys: keys.length
          };
        } catch (redisError) {
          console.warn('[Dashboard API] Redis error, using fallback stats:', redisError.message);
          return {
            hitRate: 0,
            missRate: 0,
            memoryUsage: 0,
            evictionRate: 0,
            totalKeys: 0
          };
        }
      }
      return {
        hitRate: 0,
        missRate: 0,
        memoryUsage: 0,
        evictionRate: 0,
        totalKeys: 0
      };
    } catch (error) {
      console.error('[Dashboard API] Error getting cache performance:', error);
      return {
        hitRate: 0,
        missRate: 0,
        memoryUsage: 0,
        evictionRate: 0,
        totalKeys: 0
      };
    }
  }

  // Get provider performance data
  async getProviderPerformance() {
    try {
      // Get real provider performance stats from request tracker
      const realStats = await requestTracker.getProviderPerformance();
      
      // If no real data yet, return empty array to avoid showing fake data
      if (realStats.length === 0) {
        return [];
      }
      
      return realStats;
    } catch (error) {
      console.error('[Dashboard API] Error getting provider performance:', error);
      return [];
    }
  }

  // Get recent activity
  async getRecentActivity(limit = 20) {
    try {
      console.log('[Dashboard API] Getting recent activity...');
      
      const activities = await requestTracker.getRecentActivity(limit);
      console.log(`[Dashboard API] Got ${activities.length} activities from request tracker`);
      
      // Format activities for display
      const formattedActivities = activities.map(activity => {
        const timeAgo = this.getTimeAgo(new Date(activity.timestamp));
        
        return {
          id: activity.id,
          type: activity.type,
          details: activity.details,
          timestamp: activity.timestamp,
          timeAgo: timeAgo,
          userAgent: activity.userAgent
        };
      });
      
      console.log(`[Dashboard API] Returning ${formattedActivities.length} formatted activities`);
      return formattedActivities;
      
    } catch (error) {
      console.error('[Dashboard API] Error getting recent activity:', error);
      return [];
    }
  }

  // Helper method to format time ago
  getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    
    return date.toLocaleDateString();
  }

  // Get provider API key status and rate limits
  async getProviderStatus() {
    try {
      const providers = [
        {
          name: 'TMDB',
          apiKey: !!process.env.TMDB_API,
          envVar: 'TMDB_API'
        },
        {
          name: 'TVDB', 
          apiKey: !!process.env.TVDB_API_KEY,
          envVar: 'TVDB_API_KEY'
        },
        {
          name: 'AniList',
          apiKey: true, // AniList doesn't require API key
          envVar: null
        },
        {
          name: 'MAL',
          apiKey: true, // MAL via Jikan doesn't require API key (3 req/sec, 60 req/min)
          envVar: null
        },
        {
          name: 'Kitsu',
          apiKey: true, // Kitsu doesn't require API key
          envVar: null
        }
      ];

      const providerStatus = await Promise.all(
        providers.map(async (provider) => {
          try {
            const providerKey = provider.name.toLowerCase();
            
            // Try to get real rate limit data first
            const rateLimitKey = `provider_rate_limit:${providerKey}`;
            const rateLimitData = await this.cache.get(rateLimitKey);
            
            let rateLimit = '0/1000'; // default fallback
            let status = 'healthy';
            
            if (rateLimitData) {
              try {
                const parsed = JSON.parse(rateLimitData);
                const now = Date.now();
                
                // Check if rate limit data is still valid (within 1 hour)
                if (now - parsed.timestamp < 3600000) {
                  // Use real rate limit data
                  rateLimit = `${parsed.remaining}/${parsed.limit}`;
                  
                  // Calculate percentage used
                  const percentageUsed = ((parsed.limit - parsed.remaining) / parsed.limit) * 100;
                  
                  if (percentageUsed > 90) {
                    status = 'error';
                  } else if (percentageUsed > 75) {
                    status = 'warning';
                  } else {
                    status = 'healthy';
                  }
                  
                  // Check if rate limit is resetting soon
                  if (parsed.reset && parsed.reset * 1000 < now + 300000) { // 5 minutes
                    status = 'warning'; // Reset soon
                  }
                }
              } catch (parseError) {
                console.warn(`[Dashboard API] Failed to parse rate limit data for ${provider.name}:`, parseError.message);
              }
            }
            
            // Fallback to hourly call tracking if no real rate limit data
            if (rateLimit === '0/1000') {
              const currentHour = new Date().toISOString().substring(0, 13);
              const hourlyCallsKey = `provider_calls:${providerKey}:${currentHour}`;
              const currentCalls = await this.cache.get(hourlyCallsKey) || 0;
              
              // Use conservative hourly limits as fallback
              switch (provider.name) {
                case 'TMDB':
                  rateLimit = `${currentCalls}/1000`;
                  if (currentCalls > 800) status = 'warning';
                  if (currentCalls > 1000) status = 'error';
                  break;
                case 'TVDB':
                  rateLimit = `${currentCalls}/100`;
                  if (currentCalls > 80) status = 'warning';
                  if (currentCalls > 100) status = 'error';
                  break;
                case 'AniList':
                  // AniList: 90 requests per minute (currently degraded to 30)
                  // Use 30 as the current limit due to degraded state
                  rateLimit = `${currentCalls}/30`;
                  if (currentCalls > 22) status = 'warning';  // 75% of 30
                  if (currentCalls > 30) status = 'error';    // Over limit
                  break;
                case 'MAL':
                  // Jikan: 3 requests per second = 180 per minute = 10,800 per hour
                  // But be conservative and use 60 per minute as the practical limit
                  rateLimit = `${currentCalls}/60`;
                  if (currentCalls > 45) status = 'warning';  // 75% of 60
                  if (currentCalls > 60) status = 'error';    // Over limit
                  break;
                case 'Kitsu':
                  rateLimit = `${currentCalls}/500`;
                  if (currentCalls > 400) status = 'warning';
                  if (currentCalls > 500) status = 'error';
                  break;
              }
            }
            
            // Override status if API key is missing for required providers
            if (!provider.apiKey && provider.envVar) {
              status = 'warning';
            }
            
            return {
              name: provider.name,
              apiKey: provider.apiKey,
              rateLimit: rateLimit,
              status: status,
              envVar: provider.envVar
            };
          } catch (providerError) {
            console.warn(`[Dashboard API] Failed to get status for provider ${provider.name}:`, providerError.message);
            return {
              name: provider.name,
              apiKey: provider.apiKey,
              rateLimit: '0/1000',
              status: 'error',
              envVar: provider.envVar
            };
            }
          }
        )
      );

      return providerStatus;
    } catch (error) {
      console.error('[Dashboard API] Error getting provider status:', error);
      return [];
    }
  }

  // Get aggregated system configuration stats
  async getSystemConfig() {
    try {
      // Load all user configurations to aggregate statistics
      let userConfigs = [];
      let totalUsers = 0;
      
      try {
        if (this.database) {
          // Get all user UUIDs from the database
          const userUUIDs = await this.database.getAllUserUUIDs();
          totalUsers = userUUIDs.length;
          
          // Sample some configurations for analysis (up to 100 for performance)
          const sampleUUIDs = userUUIDs.slice(0, 100);
          const configPromises = sampleUUIDs.map(async (userUUID) => {
            try {
              return await this.database.getUserConfig(userUUID);
            } catch (error) {
              return null;
            }
          });
          
          const configs = await Promise.all(configPromises);
          userConfigs = configs.filter(config => config !== null);
        }
      } catch (dbError) {
        console.warn('[Dashboard API] Failed to load user configs for aggregation:', dbError.message);
      }
      
      // Calculate aggregated statistics
      const stats = this.calculateConfigStats(userConfigs);
      
      return {
        totalUsers: totalUsers,
        sampleSize: userConfigs.length,
        aggregatedStats: stats,
        redisConnected: this.cache ? true : false,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('[Dashboard API] Error getting system config:', error);
      return {
        totalUsers: 0,
        sampleSize: 0,
        aggregatedStats: this.getDefaultStats(),
        redisConnected: false,
        lastUpdated: new Date().toISOString()
      };
    }
  }

  // Calculate configuration statistics from user configs
  calculateConfigStats(userConfigs) {
    if (userConfigs.length === 0) {
      return this.getDefaultStats();
    }

    const total = userConfigs.length;
    const stats = {
      languages: {},
      metaProviders: { movie: {}, series: {}, anime: {} },
      artProviders: { movie: {}, series: {}, anime: {} },
      animeIdProviders: {},
      features: {
        cacheEnabled: 0,
        blurThumbs: 0,
        skipFiller: 0,
        skipRecap: 0
      }
    };

    // Aggregate data
    userConfigs.forEach(config => {
      // Language distribution
      const lang = config.language || 'en-US';
      stats.languages[lang] = (stats.languages[lang] || 0) + 1;

      // Provider distributions
      if (config.providers) {
        // Movie providers
        const movieProvider = config.providers.movie || 'tmdb';
        stats.metaProviders.movie[movieProvider] = (stats.metaProviders.movie[movieProvider] || 0) + 1;
        
        // Series providers  
        const seriesProvider = config.providers.series || 'tvdb';
        stats.metaProviders.series[seriesProvider] = (stats.metaProviders.series[seriesProvider] || 0) + 1;
        
        // Anime providers
        const animeProvider = config.providers.anime || 'mal';
        stats.metaProviders.anime[animeProvider] = (stats.metaProviders.anime[animeProvider] || 0) + 1;
        
        // Anime ID providers
        const animeIdProvider = config.providers.anime_id_provider || 'imdb';
        stats.animeIdProviders[animeIdProvider] = (stats.animeIdProviders[animeIdProvider] || 0) + 1;
      }

      // Art providers
      if (config.artProviders) {
        const movieArt = config.artProviders.movie || config.providers?.movie || 'tmdb';
        stats.artProviders.movie[movieArt] = (stats.artProviders.movie[movieArt] || 0) + 1;
        
        const seriesArt = config.artProviders.series || config.providers?.series || 'tvdb';
        stats.artProviders.series[seriesArt] = (stats.artProviders.series[seriesArt] || 0) + 1;
        
        const animeArt = config.artProviders.anime || config.providers?.anime || 'mal';
        stats.artProviders.anime[animeArt] = (stats.artProviders.anime[animeArt] || 0) + 1;
      }

      // Feature usage
      if (config.cacheEnabled !== false) stats.features.cacheEnabled++;
      if (config.blurThumbs) stats.features.blurThumbs++;
      if (config.mal?.skipFiller) stats.features.skipFiller++;
      if (config.mal?.skipRecap) stats.features.skipRecap++;
    });

    // Convert to percentages and format for display
    return this.formatStatsForDisplay(stats, total);
  }

  // Format statistics for dashboard display
  formatStatsForDisplay(stats, total) {
    const formatDistribution = (obj) => {
      return Object.entries(obj)
        .map(([key, count]) => ({
          name: key,
          count: count,
          percentage: Math.round((count / total) * 100)
        }))
        .sort((a, b) => b.count - a.count);
    };

    return {
      languages: formatDistribution(stats.languages),
      metaProviders: {
        movie: formatDistribution(stats.metaProviders.movie),
        series: formatDistribution(stats.metaProviders.series),
        anime: formatDistribution(stats.metaProviders.anime)
      },
      artProviders: {
        movie: formatDistribution(stats.artProviders.movie),
        series: formatDistribution(stats.artProviders.series),
        anime: formatDistribution(stats.artProviders.anime)
      },
      animeIdProviders: formatDistribution(stats.animeIdProviders),
      features: {
        cacheEnabled: Math.round((stats.features.cacheEnabled / total) * 100),
        blurThumbs: Math.round((stats.features.blurThumbs / total) * 100),
        skipFiller: Math.round((stats.features.skipFiller / total) * 100),
        skipRecap: Math.round((stats.features.skipRecap / total) * 100)
      }
    };
  }

  // Get default stats when no user data is available
  getDefaultStats() {
    return {
      languages: [{ name: 'en-US', count: 0, percentage: 100 }],
      metaProviders: {
        movie: [{ name: 'tmdb', count: 0, percentage: 100 }],
        series: [{ name: 'tvdb', count: 0, percentage: 100 }],
        anime: [{ name: 'mal', count: 0, percentage: 100 }]
      },
      artProviders: {
        movie: [{ name: 'tmdb', count: 0, percentage: 100 }],
        series: [{ name: 'tvdb', count: 0, percentage: 100 }],
        anime: [{ name: 'mal', count: 0, percentage: 100 }]
      },
      animeIdProviders: [{ name: 'imdb', count: 0, percentage: 100 }],
      features: {
        cacheEnabled: 100,
        blurThumbs: 0,
        skipFiller: 0,
        skipRecap: 0
      }
    };
  }

  // Get resource usage
  async getResourceUsage() {
    try {
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const memoryUsage = Math.round(((totalMem - freeMem) / totalMem) * 100);
      
      // Get real disk usage
      let diskUsage = 0;
      try {
        const fs = require('fs');
        const stats = fs.statSync(process.cwd());
        const statvfs = fs.statSync('/');
        
        // Get disk usage - compatible with both standard Linux and BusyBox
        const { execSync } = require('child_process');
        try {
          // Try BusyBox-compatible df command first
          const dfOutput = execSync('df /', { encoding: 'utf8' });
          const lines = dfOutput.trim().split('\n');
          
          if (lines.length > 1) {
            // Parse the output: Filesystem 1K-blocks Used Available Use% Mounted
            const parts = lines[1].split(/\s+/);
            if (parts.length >= 5) {
              // Look for the percentage in the output
              const usePercent = parts.find(part => part.includes('%'));
              if (usePercent) {
                diskUsage = parseInt(usePercent.replace('%', ''));
              } else if (parts.length >= 4) {
                // Calculate manually: Used / (Used + Available) * 100
                const used = parseInt(parts[2]) || 0;
                const available = parseInt(parts[3]) || 0;
                const total = used + available;
                if (total > 0) {
                  diskUsage = Math.round((used / total) * 100);
                }
              }
            }
          }
        } catch (dfError) {
          console.warn('[Dashboard API] df command failed, using fallback disk calculation:', dfError.message);
          diskUsage = 0;
        }
      } catch (diskError) {
        console.warn('[Dashboard API] Failed to get disk usage:', diskError.message);
        diskUsage = 0;
      }
      
      // Get real network I/O
      let networkIO = 0;
      try {
        const fs = require('fs');
        const netDevPath = '/proc/net/dev';
        
        if (fs.existsSync(netDevPath)) {
          const netData = fs.readFileSync(netDevPath, 'utf8');
          const lines = netData.split('\n');
          let totalBytes = 0;
          
          for (const line of lines) {
            if (line.includes(':') && !line.includes('lo:')) { // Skip loopback
              const parts = line.trim().split(/\s+/);
              if (parts.length >= 10) {
                const rxBytes = parseInt(parts[1]) || 0;
                const txBytes = parseInt(parts[9]) || 0;
                totalBytes += rxBytes + txBytes;
              }
            }
          }
          
          // Store current measurement for rate calculation
          const now = Date.now();
          if (!this.lastNetworkMeasurement) {
            this.lastNetworkMeasurement = { bytes: totalBytes, time: now };
            networkIO = 0;
          } else {
            const timeDiff = (now - this.lastNetworkMeasurement.time) / 1000; // seconds
            const bytesDiff = totalBytes - this.lastNetworkMeasurement.bytes;
            
            if (timeDiff > 0) {
              networkIO = parseFloat((bytesDiff / timeDiff / 1024 / 1024).toFixed(1)); // MB/s
            }
            
            this.lastNetworkMeasurement = { bytes: totalBytes, time: now };
          }
        }
      } catch (networkError) {
        console.warn('[Dashboard API] Failed to get network I/O:', networkError.message);
        networkIO = 0;
      }
      
      return {
        memoryUsage,
        cpuUsage: Math.round(os.loadavg()[0] * 100), // 1 minute load average
        diskUsage: Math.max(0, Math.min(100, diskUsage)), // Ensure 0-100%
        networkIO: Math.max(0, networkIO) // Ensure non-negative
      };
    } catch (error) {
      console.error('[Dashboard API] Error getting resource usage:', error);
      return {
        memoryUsage: 0,
        cpuUsage: 0,
        diskUsage: 0,
        networkIO: 0
      };
    }
  }

  // Get error logs
  async getErrorLogs() {
    try {
      // TODO: Implement real error logging system
      return [
        { id: 1, level: 'warning', message: 'TMDB rate limit approaching', timestamp: '2 minutes ago', count: 3 },
        { id: 2, level: 'error', message: 'Failed to fetch from AniList API', timestamp: '15 minutes ago', count: 1 },
        { id: 3, level: 'info', message: 'Cache warming completed', timestamp: '1 hour ago', count: 1 }
      ];
    } catch (error) {
      console.error('[Dashboard API] Error getting error logs:', error);
      return [];
    }
  }

  // Get maintenance tasks
  async getMaintenanceTasks() {
    try {
      const now = Date.now();
      const tasks = [];
      
      // 1. Cache cleanup task - check if Redis has cleanup data
      try {
        if (this.cache) {
          const lastCleanup = await this.cache.get('maintenance:last_cache_cleanup');
          const cacheCleanupStatus = lastCleanup ? 'completed' : 'scheduled';
          const cacheCleanupTime = lastCleanup ? this.getTimeAgo(new Date(parseInt(lastCleanup))) : 'Never';
          
          tasks.push({
            id: 1,
            name: 'Clear expired cache entries',
            status: cacheCleanupStatus,
            lastRun: cacheCleanupTime,
            description: 'Removes expired keys from Redis cache',
            nextRun: cacheCleanupStatus === 'completed' ? 'In 6 hours' : 'Now'
          });
        }
      } catch (error) {
        console.warn('[Dashboard API] Failed to get cache cleanup status:', error.message);
        tasks.push({
          id: 1,
          name: 'Clear expired cache entries',
          status: 'error',
          lastRun: 'Unknown',
          description: 'Removes expired keys from Redis cache',
          nextRun: 'Now'
        });
      }
      
      // 2. Anime-list update task - check actual update timestamps
      try {
        if (this.cache) {
          const animeListLastUpdate = await this.cache.get('anime_list:last_update');
          const animeListStatus = animeListLastUpdate ? 'completed' : 'scheduled';
          const animeListTime = animeListLastUpdate ? this.getTimeAgo(new Date(parseInt(animeListLastUpdate))) : 'Never';
          
          tasks.push({
            id: 2,
            name: 'Update anime-list XML',
            status: animeListStatus,
            lastRun: animeListTime,
            description: 'Updates anime mappings from remote sources',
            nextRun: animeListStatus === 'completed' ? 'In 24 hours' : 'Now'
          });
        }
      } catch (error) {
        console.warn('[Dashboard API] Failed to get anime-list status:', error.message);
        tasks.push({
          id: 2,
          name: 'Update anime-list XML',
          status: 'error',
          lastRun: 'Unknown',
          description: 'Updates anime mappings from remote sources',
          nextRun: 'Now'
        });
      }
      
      // 3. ID Mapper update task - check actual update timestamps
      try {
        if (this.cache) {
          const idMapperLastUpdate = await this.cache.get('maintenance:last_id_mapper_update');
          const idMapperStatus = idMapperLastUpdate ? 'completed' : 'scheduled';
          const idMapperTime = idMapperLastUpdate ? this.getTimeAgo(new Date(parseInt(idMapperLastUpdate))) : 'Never';
          
          tasks.push({
            id: 3,
            name: 'Update ID Mapper',
            status: idMapperStatus,
            lastRun: idMapperTime,
            description: 'Updates TMDB/TVDB/IMDB/MAL/Kitsu ID mappings',
            nextRun: idMapperStatus === 'completed' ? 'In 24 hours' : 'Now'
          });
        }
      } catch (error) {
        console.warn('[Dashboard API] Failed to get ID mapper status:', error.message);
        tasks.push({
          id: 3,
          name: 'Update ID Mapper',
          status: 'error',
          lastRun: 'Unknown',
          description: 'Updates TMDB/TVDB/IMDB/MAL/Kitsu ID mappings',
          nextRun: 'Now'
        });
      }
      
      // 4. Kitsu-IMDB mapping update task
      try {
        if (this.cache) {
          const kitsuImdbLastUpdate = await this.cache.get('maintenance:last_kitsu_imdb_update');
          const kitsuImdbStatus = kitsuImdbLastUpdate ? 'completed' : 'scheduled';
          const kitsuImdbTime = kitsuImdbLastUpdate ? this.getTimeAgo(new Date(parseInt(kitsuImdbLastUpdate))) : 'Never';
          
          tasks.push({
            id: 4,
            name: 'Update Kitsu-IMDB Mapping',
            status: kitsuImdbStatus,
            lastRun: kitsuImdbTime,
            description: 'Updates Kitsu to IMDB ID mappings',
            nextRun: kitsuImdbStatus === 'completed' ? 'In 24 hours' : 'Now'
          });
        }
      } catch (error) {
        console.warn('[Dashboard API] Failed to get Kitsu-IMDB status:', error.message);
        tasks.push({
          id: 4,
          name: 'Update Kitsu-IMDB Mapping',
          status: 'error',
          lastRun: 'Unknown',
          description: 'Updates Kitsu to IMDB ID mappings',
          nextRun: 'Now'
        });
      }
      
      // 5. Database optimization task
      try {
        if (this.cache) {
          const lastDbOptimization = await this.cache.get('maintenance:last_db_optimization');
          const dbStatus = lastDbOptimization ? 'completed' : 'scheduled';
          const dbTime = lastDbOptimization ? this.getTimeAgo(new Date(parseInt(lastDbOptimization))) : 'Never';
          
          tasks.push({
            id: 5,
            name: 'Database optimization',
            status: dbStatus,
            lastRun: dbTime,
            description: 'Optimizes SQLite database performance',
            nextRun: dbStatus === 'completed' ? 'In 7 days' : 'Now'
          });
        }
      } catch (error) {
        console.warn('[Dashboard API] Failed to get database status:', error.message);
        tasks.push({
          id: 5,
          name: 'Database optimization',
          status: 'error',
          lastRun: 'Unknown',
          description: 'Optimizes SQLite database performance',
          nextRun: 'Now'
        });
      }
      
      // 6. System health check task
      try {
        if (this.cache) {
          const lastHealthCheck = await this.cache.get('maintenance:last_health_check');
          const healthStatus = lastHealthCheck ? 'completed' : 'running';
          const healthTime = lastHealthCheck ? this.getTimeAgo(new Date(parseInt(lastHealthCheck))) : 'Just now';
          
          tasks.push({
            id: 6,
            name: 'System health check',
            status: healthStatus,
            lastRun: healthTime,
            description: 'Monitors system resources and services',
            nextRun: healthStatus === 'completed' ? 'In 1 hour' : 'Running'
          });
        }
      } catch (error) {
        console.warn('[Dashboard API] Failed to get health check status:', error.message);
        tasks.push({
          id: 6,
          name: 'System health check',
          status: 'error',
          lastRun: 'Unknown',
          description: 'Monitors system resources and services',
          nextRun: 'Now'
        });
      }
      
      // 7. Cache warming task
      try {
        if (this.cache) {
          const lastCacheWarming = await this.cache.get('maintenance:last_cache_warming');
          const warmingStatus = lastCacheWarming ? 'completed' : 'scheduled';
          const warmingTime = lastCacheWarming ? this.getTimeAgo(new Date(parseInt(lastCacheWarming))) : 'Never';
          
          tasks.push({
            id: 7,
            name: 'Cache warming',
            status: warmingStatus,
            lastRun: warmingTime,
            description: 'Preloads essential content into cache',
            nextRun: warmingStatus === 'completed' ? 'In 30 minutes' : 'Now'
          });
        }
      } catch (error) {
        console.warn('[Dashboard API] Failed to get cache warming status:', error.message);
        tasks.push({
          id: 7,
          name: 'Cache warming',
          status: 'error',
          lastRun: 'Unknown',
          description: 'Preloads essential content into cache',
          nextRun: 'Now'
        });
      }
      
      return tasks;
    } catch (error) {
      console.error('[Dashboard API] Error getting maintenance tasks:', error);
      return [];
    }
  }

  // Clear cache by type
  async clearCache(type) {
    try {
      if (!this.cache) {
        throw new Error('Cache not available');
      }

      switch (type) {
        case 'all':
          // For Redis client, we'll clear all keys
          const keys = await this.cache.keys('*');
          if (keys.length > 0) {
            await this.cache.del(...keys);
          }
          break;
        case 'expired':
          // TODO: Implement expired cache clearing
          // Redis automatically expires keys, so this is mostly for manual cleanup
          break;
        case 'metadata':
          // Clear metadata-related keys
          const metadataKeys = await this.cache.keys('*meta*');
          if (metadataKeys.length > 0) {
            await this.cache.del(...metadataKeys);
          }
          break;
        default:
          throw new Error(`Unknown cache type: ${type}`);
      }

      return { success: true, message: `Cache ${type} cleared successfully` };
    } catch (error) {
      console.error('[Dashboard API] Error clearing cache:', error);
      return { success: false, message: error.message };
    }
  }

  // Get all dashboard data
  async getAllDashboardData() {
    try {
      const [
        systemOverview,
        quickStats,
        cachePerformance,
        providerPerformance,
        systemConfig,
        resourceUsage,
        errorLogs,
        maintenanceTasks
      ] = await Promise.all([
        this.getSystemOverview(),
        this.getQuickStats(),
        this.getCachePerformance(),
        this.getProviderPerformance(),
        this.getSystemConfig(),
        this.getResourceUsage(),
        this.getErrorLogs(),
        this.getMaintenanceTasks()
      ]);

      return {
        systemOverview,
        quickStats,
        cachePerformance,
        providerPerformance,
        systemConfig,
        resourceUsage,
        errorLogs,
        maintenanceTasks,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('[Dashboard API] Error getting all dashboard data:', error);
      throw error;
    }
  }
}

module.exports = DashboardAPI;
