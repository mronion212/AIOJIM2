interface CatalogDefinition {
  id: string;
  name: string;
  type: 'movie' | 'series' | 'anime';
  source: 'tmdb' | 'tvdb' | 'mal' | 'tvmaze'; // Optional source for better categorization
  isEnabledByDefault?: boolean;
  showOnHomeByDefault?: boolean;
}

// --- Catalogs sourced from TMDB and TVDB ---
export const baseCatalogs: CatalogDefinition[] = [
  { id: 'tmdb.top', name: 'TMDB Popular Movies', type: 'movie', source: 'tmdb', isEnabledByDefault: true, showOnHomeByDefault: true },
  { id: 'tmdb.top', name: 'TMDB Popular Series', type: 'series', source: 'tmdb', isEnabledByDefault: true, showOnHomeByDefault: true },
  { id: 'tmdb.trending', name: 'TMDB Trending Movies', type: 'movie', source: 'tmdb', isEnabledByDefault: true, showOnHomeByDefault: true },
  { id: 'tmdb.trending', name: 'TMDB Trending Series', type: 'series', source: 'tmdb', isEnabledByDefault: true, showOnHomeByDefault: true },
  { id: 'tmdb.year', name: 'TMDB By Year (Movies)', type: 'movie', source: 'tmdb', isEnabledByDefault: true, showOnHomeByDefault: false },
  { id: 'tmdb.year', name: 'TMDB By Year (Series)', type: 'series', source: 'tmdb', isEnabledByDefault: true, showOnHomeByDefault: false },
  { id: 'tmdb.language', name: 'TMDB By Language (Movies)', type: 'movie', source: 'tmdb', isEnabledByDefault: true, showOnHomeByDefault: false },
  { id: 'tmdb.language', name: 'TMDB By Language (Series)', type: 'series', source: 'tmdb', isEnabledByDefault: true, showOnHomeByDefault: false },
];

// --- Catalogs sourced from MyAnimeList ---
export const animeCatalogs: CatalogDefinition[] = [
  { id: 'mal.airing', name: 'MAL Airing Now', type: 'anime', source: 'mal', isEnabledByDefault: true, showOnHomeByDefault: true },
  { id: 'mal.upcoming', name: 'MAL Upcoming Season', type: 'anime', source: 'mal', isEnabledByDefault: true, showOnHomeByDefault: true },
  { id: 'mal.schedule', name: 'MAL Airing Schedule', type: 'anime', source: 'mal', isEnabledByDefault: true, showOnHomeByDefault: false },
  { id: 'mal.decade80s', name: 'MAL Best of 80s', type: 'anime', source: 'mal', isEnabledByDefault: true, showOnHomeByDefault: true },
  { id: 'mal.decade90s', name: 'MAL Best of 90s', type: 'anime', source: 'mal', isEnabledByDefault: true, showOnHomeByDefault: true },
  { id: 'mal.decade00s', name: 'MAL Best of 2000s', type: 'anime', source: 'mal', isEnabledByDefault: true, showOnHomeByDefault: true },
  { id: 'mal.decade10s', name: 'MAL Best of 2010s', type: 'anime', source: 'mal', isEnabledByDefault: true, showOnHomeByDefault: true },
  { id: 'mal.decade20s', name: 'MAL Best of 2020s', type: 'anime', source: 'mal', isEnabledByDefault: true, showOnHomeByDefault: true },
  { id: 'mal.genres', name: 'MAL Genres', type: 'anime', source: 'mal', isEnabledByDefault: true, showOnHomeByDefault: true }, 
]

// --- Catalogs requiring TMDB Authentication ---
export const authCatalogs: CatalogDefinition[] = [
    { id: 'tmdb.favorites', name: 'TMDB Favorites (Movies)', type: 'movie', source: 'tmdb', isEnabledByDefault: false, showOnHomeByDefault: false },
    { id: 'tmdb.favorites', name: 'TMDB Favorites (Series)', type: 'series', source: 'tmdb', isEnabledByDefault: false, showOnHomeByDefault: false },
    { id: 'tmdb.watchlist', name: 'TMDB Watchlist (Movies)', type: 'movie', source: 'tmdb', isEnabledByDefault: false, showOnHomeByDefault: false },
    { id: 'tmdb.watchlist', name: 'TMDB Watchlist (Series)', type: 'series', source: 'tmdb', isEnabledByDefault: false, showOnHomeByDefault: false },
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
    { id: 'tvmaze.search', name: 'TVmaze Search' },
];

export const allCatalogDefinitions: CatalogDefinition[] = [
  ...baseCatalogs,
  ...animeCatalogs,
  ...authCatalogs
]; 
