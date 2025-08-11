import React, { createContext, useContext, useState, useEffect, useRef  } from "react";
import { AppConfig, CatalogConfig, SearchConfig } from "./config";
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { allCatalogDefinitions, allSearchProviders } from "@/data/catalogs"; 

interface ConfigContextType {
  config: AppConfig;
  setConfig: React.Dispatch<React.SetStateAction<AppConfig>>;
  addonVersion: string;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

const CONFIG_STORAGE_KEY = 'stremio-addon-config';

let initialConfigFromSources: AppConfig | null = null;
let hasInitialized = false;

function initializeConfigFromSources(): AppConfig | null {
  if (hasInitialized) {
    return initialConfigFromSources;
  }
  hasInitialized = true;

  let loadedConfig: any = null; 

  try {
    const pathParts = window.location.pathname.split('/');
    const configStringIndex = pathParts.findIndex(p => p.toLowerCase() === 'configure');
    if (configStringIndex > 0 && pathParts[configStringIndex - 1]) {
      const decompressed = decompressFromEncodedURIComponent(pathParts[configStringIndex - 1]);
      if (decompressed) {
        console.log('[Config] Initializing from URL.');
        loadedConfig = JSON.parse(decompressed);
        window.history.replaceState({}, '', '/configure');
      }
    }
  } catch (e) { /* Fall through */ }

  if (!loadedConfig) {
    try {
      const storedConfig = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (storedConfig) {
        console.log('[Config] Initializing from localStorage.');
        loadedConfig = JSON.parse(storedConfig);
      }
    } catch (e) { /* Fall through */ }
  }

  if (loadedConfig) {
    const providers = loadedConfig.search?.providers;
    if (providers && providers.anime) {
      console.log("[Config Migration] Old 'anime' provider found. Upgrading configuration...");
      
      providers.anime_movie = providers.anime_movie || 'mal.search.movie';
      providers.anime_series = providers.anime_series || 'mal.search.series';
      
      delete providers.anime;
      
      try {
        localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(loadedConfig));
        console.log("[Config Migration] Migrated config saved back to localStorage.");
      } catch (e) {
        console.error("[Config Migration] Failed to save migrated config:", e);
      }
    }
  }

  initialConfigFromSources = loadedConfig;
  return initialConfigFromSources;
}


// --- Define the initial, default state for a new user ---
const initialConfig: AppConfig = {
  language: "en-US",
  includeAdult: false,
  blurThumbs: false,
  showPrefix: false, 
  providers: { movie: 'tmdb', series: 'tvdb', anime: 'mal', anime_id_provider: 'imdb', },
  tvdbSeasonType: 'default',
  mal: {
    skipFiller: false, 
    skipRecap: false,
  },
  apiKeys: { 
    gemini: "", 
    tmdb: "",
    tvdb: "",
    fanart: "", 
    rpdb: "", 
    mdblist: "" 
  },
  ageRating: 'None',
  searchEnabled: true,
  sessionId: "",
  catalogs: allCatalogDefinitions
    .map(c => ({
      id: c.id,
      name: c.name,
      type: c.type,
      source: c.source,
      enabled: c.isEnabledByDefault || false,
      showInHome: c.showOnHomeByDefault || false,
    })),
  search: {
    enabled: true,
    providers: {
      movie: 'tmdb.search',
      series: 'tvdb.search',
      anime_movie: 'mal.search.movie',
      anime_series: 'mal.search.series',
    },
  }
};


export function ConfigProvider({ children }: { children: React.ReactNode }) {
  // This part is all correct
  const [addonVersion, setAddonVersion] = useState<string>(' ');
  const [preloadedConfig] = useState(initializeConfigFromSources);
  const [config, setConfig] = useState<AppConfig>(() => {
    if (preloadedConfig) {
      const definitionMap = new Map(allCatalogDefinitions.map(def => [`${def.id}-${def.type}`, def]));
      const hydratedCatalogs = (preloadedConfig.catalogs || []).map(userCatalog => {
        const definition = definitionMap.get(`${userCatalog.id}-${userCatalog.type}`);
        if (definition) {
          return {
            ...definition, 
            ...userCatalog, 
          };
        }
        return userCatalog;
      });
      return {
        ...initialConfig,
        ...preloadedConfig,
        apiKeys: { ...initialConfig.apiKeys, ...preloadedConfig.apiKeys },
        providers: { ...initialConfig.providers, ...preloadedConfig.providers },
        search: { ...initialConfig.search, ...preloadedConfig.search },
        catalogs: hydratedCatalogs,
      };
    }
    return initialConfig;
  });
  const [isLoading, setIsLoading] = useState(true);

  // --- THIS IS THE CORRECTED EFFECT ---
  useEffect(() => {
    let isMounted = true;
    const finalizeConfig = async () => {
      try {
        const envResponse = await fetch('/api/config');
        if (!isMounted) return;
        const envApiKeys = await envResponse.json();
        setAddonVersion(envApiKeys.addonVersion || ' ');

        // Layer in the server keys with the correct priority.
        // We use `preloadedConfig` because it holds the user's saved data.
        setConfig(currentConfig => ({
          ...currentConfig,
          apiKeys: {
            ...initialConfig.apiKeys,   // Priority 3: Default empty strings
            ...envApiKeys,              // Priority 2: Server-provided keys
            ...preloadedConfig?.apiKeys // Priority 1: User's saved keys (from URL or localStorage)
          }
        }));

      } catch (e) {
        console.error("Could not fetch server-side keys.", e);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    finalizeConfig();
    return () => { isMounted = false; };
  }, []); // The empty dependency array is correct.

  // --- The rest of your component is correct ---
  useEffect(() => {
    if (isLoading) return;
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  }, [config, isLoading]);

  if (isLoading) {
    return <div>Loading configuration...</div>;
  }

  return (
    <ConfigContext.Provider value={{ config, setConfig, addonVersion }}>
      {children}
    </ConfigContext.Provider>
  );
}

export const useConfig = () => {
  const context = useContext(ConfigContext);
  if (context === undefined) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
};
export type { AppConfig };

export type { CatalogConfig };

