interface CatalogDefinition {
  id: string;
  name: string;
  type: 'movie' | 'series' | 'anime';
  isEnabledByDefault?: boolean; 
  showOnHomeByDefault?: boolean;
}

// --- Catalogs sourced from TMDB and TVDB ---
export const baseCatalogs: CatalogDefinition[] = [
  { id: 'tmdb.top', name: 'TMDB Popular Movies', type: 'movie', isEnabledByDefault: true, showOnHomeByDefault: true },
  { id: 'tmdb.top', name: 'TMDB Popular Series', type: 'series', isEnabledByDefault: true, showOnHomeByDefault: true },
  { id: 'tmdb.trending', name: 'TMDB Trending Movies', type: 'movie', isEnabledByDefault: true, showOnHomeByDefault: true },
  { id: 'tmdb.trending', name: 'TMDB Trending Series', type: 'series', isEnabledByDefault: true, showOnHomeByDefault: true },
  { id: 'tmdb.year', name: 'TMDB By Year (Movies)', type: 'movie', isEnabledByDefault: true, showOnHomeByDefault: false },
  { id: 'tmdb.year', name: 'TMDB By Year (Series)', type: 'series', isEnabledByDefault: true, showOnHomeByDefault: false },
  { id: 'tmdb.language', name: 'TMDB By Language (Movies)', type: 'movie', isEnabledByDefault: true, showOnHomeByDefault: false },
  { id: 'tmdb.language', name: 'TMDB By Language (Series)', type: 'series', isEnabledByDefault: true, showOnHomeByDefault: false },
];

// --- Catalogs sourced from MyAnimeList ---
export const animeCatalogs: CatalogDefinition[] = [
  { id: 'mal.airing', name: 'MAL Airing Now', type: 'anime', isEnabledByDefault: true, showOnHomeByDefault: true },
  { id: 'mal.upcoming', name: 'MAL Upcoming Season', type: 'anime', isEnabledByDefault: true, showOnHomeByDefault: true },
  { id: 'mal.schedule', name: 'MAL Airing Schedule', type: 'anime', isEnabledByDefault: true, showOnHomeByDefault: false },
  { id: 'mal.decade80s', name: 'MAL Best of 80s', type: 'anime', isEnabledByDefault: true, showOnHomeByDefault: true },
  { id: 'mal.decade90s', name: 'MAL Best of 90s', type: 'anime', isEnabledByDefault: true, showOnHomeByDefault: true },
  { id: 'mal.decade00s', name: 'MAL Best of 2000s', type: 'anime', isEnabledByDefault: true, showOnHomeByDefault: true },
  { id: 'mal.decade10s', name: 'MAL Best of 2010s', type: 'anime', isEnabledByDefault: true, showOnHomeByDefault: true },
  { id: 'mal.decade20s', name: 'MAL Best of 2020s', type: 'anime', isEnabledByDefault: true, showOnHomeByDefault: true },
  { id: 'mal.genres', name: 'MAL Genres', type: 'anime', isEnabledByDefault: true, showOnHomeByDefault: true }, 
]

// --- Catalogs requiring TMDB Authentication ---
export const authCatalogs: CatalogDefinition[] = [
    { id: 'tmdb.favorites', name: 'TMDB Favorites (Movies)', type: 'movie', isEnabledByDefault: false, showOnHomeByDefault: false },
    { id: 'tmdb.favorites', name: 'TMDB Favorites (Series)', type: 'series', isEnabledByDefault: false, showOnHomeByDefault: false },
    { id: 'tmdb.watchlist', name: 'TMDB Watchlist (Movies)', type: 'movie', isEnabledByDefault: false, showOnHomeByDefault: false },
    { id: 'tmdb.watchlist', name: 'TMDB Watchlist (Series)', type: 'series', isEnabledByDefault: false, showOnHomeByDefault: false },
];

interface SearchProviderDefinition {
  id: string;
  name: string;
  type: 'movie' | 'series' | 'anime';
}

export const allSearchProviders: SearchProviderDefinition[] = [
    { id: 'tmdb.search', name: 'TMDB Search' },
    { id: 'tvdb.search', name: 'TVDB Search' },
    { id: 'mal.search', name: 'MAL Search' },
];

export const allCatalogDefinitions: CatalogDefinition[] = [
  ...baseCatalogs,
  ...animeCatalogs,
  ...authCatalogs
]; 
