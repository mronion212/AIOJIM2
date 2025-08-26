export interface CatalogConfig {
  id: string;
  name: string;
  type: 'movie' | 'series' | 'anime';
  enabled: boolean;
  source: 'tmdb' | 'tvdb' | 'mal' | 'tvmaze' | 'mdblist' | 'streaming';
  showInHome: boolean;
}

export interface SearchConfig {
    id: string;
    name: string;
    type: 'movie' | 'series' | 'anime';
    enabled: boolean;
}

export interface AppConfig {
  language: string;
  includeAdult: boolean;
  blurThumbs: boolean;
  showPrefix: boolean;
  castCount: number;
  providers: {
    movie: string;
    series: string;
    anime: string;
    anime_id_provider: 'kitsu' | 'mal' | 'imdb';
  };
  artProviders: {
    movie: 'meta' | 'tmdb' | 'tvdb' | 'fanart';
    series: 'meta' | 'tmdb' | 'tvdb' | 'fanart';
    anime: 'meta' | 'mal' | 'anilist' | 'tvdb' | 'fanart';
  };
  tvdbSeasonType: string;
  mal: {
    skipFiller: boolean;
    skipRecap: boolean;
  };
  apiKeys: {
    gemini: string;
    tmdb: string;
    tvdb: string;
    fanart: string;
    rpdb: string;
    mdblist: string;
  };
  ageRating: string;
  sfw: boolean;
  searchEnabled: boolean;
  sessionId: string;
  catalogs: CatalogConfig[];
  deletedCatalogs?: string[];
  search: {
    enabled: boolean; 
    // This is the switch for the AI layer.
    ai_enabled: boolean; 
    // This stores the primary keyword engine for each type.
    providers: {
        movie: 'tmdb.search' | 'tvdb.search' | 'mal.search.movie';
        series: 'tmdb.search' | 'tvdb.search' | 'tvmaze.search' | 'mal.search.series';
        anime_movie: string;
        anime_series: string;
    };
    // New: per-engine enable/disable
    engineEnabled?: {
      [engine: string]: boolean;
    };
  };
  streaming: string[];
}
