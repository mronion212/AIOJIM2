import React, { createContext, useContext, useState, useEffect, useRef  } from "react";
import { AppConfig, CatalogConfig, SearchConfig } from "./configTypes";
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { allCatalogDefinitions, allSearchProviders } from "@/data/catalogs"; 

interface ConfigContextType {
  config: AppConfig;
  setConfig: React.Dispatch<React.SetStateAction<AppConfig>>;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

const CONFIG_STORAGE_KEY = 'stremio-addon-config';

// --- The Singleton Initializer (Upgraded) ---
let initialConfigFromSources: AppConfig | null = null;
let hasInitialized = false;

function initializeConfigFromSources(): AppConfig | null {
  if (hasInitialized) {
    return initialConfigFromSources;
  }
  hasInitialized = true;

  // PRIORITY 1: Check the URL
  try {
    const pathParts = window.location.pathname.split('/');
    const configStringIndex = pathParts.findIndex(p => p.toLowerCase() === 'configure');
    if (configStringIndex > 0 && pathParts[configStringIndex - 1]) {
      const decompressed = decompressFromEncodedURIComponent(pathParts[configStringIndex - 1]);
      if (decompressed) {
        console.log('[Config] Initialized from URL.');
        initialConfigFromSources = JSON.parse(decompressed);
        window.history.replaceState({}, '', '/configure'); // Clean URL after import
        return initialConfigFromSources;
      }
    }
  } catch (e) { /* Fall through */ }

  // PRIORITY 2: Check localStorage
  try {
    const storedConfig = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (storedConfig) {
      console.log('[Config] Initialized from localStorage.');
      initialConfigFromSources = JSON.parse(storedConfig);
      return initialConfigFromSources;
    }
  } catch (e) { /* Fall through */ }
  console.log('[Config] No saved config found. Will use defaults.');
  return null;
}


// --- Define the initial, default state for a new user ---
const initialConfig: AppConfig = {
  language: "en-US",
  includeAdult: false,
  blurThumbs: true,
  providers: { movie: 'tmdb', series: 'tvdb', anime: 'mal', anime_id_provider: 'kitsu', },
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
      anime: 'mal.search',
    },
  }
};


export function ConfigProvider({ children }: { children: React.ReactNode }) {
  // Use our new initializer. This will synchronously get the config from URL or localStorage.
  const [preloadedConfig] = useState(initializeConfigFromSources);

  const [config, setConfig] = useState<AppConfig>(() => {
    // Set the initial state by merging the preloaded config with defaults
    // This ensures new properties in `initialConfig` are not lost for returning users.
    if (preloadedConfig) {
      return {
        ...initialConfig,
        ...preloadedConfig,
        apiKeys: { ...initialConfig.apiKeys, ...preloadedConfig.apiKeys },
        providers: { ...initialConfig.providers, ...preloadedConfig.providers },
        search: { ...initialConfig.search, ...preloadedConfig.search },
        catalogs: allCatalogDefinitions.map(def => {
            const userSetting = preloadedConfig.catalogs?.find(c => c.id === def.id && c.type === def.type);
            return { ...def, name: def.name, ...userSetting };
        })
      };
    }
    return initialConfig;
  });
  
  const [isLoading, setIsLoading] = useState(true);

  // Effect for fetching server keys AND merging with the preloaded config
  useEffect(() => {
    let isMounted = true;
    const finalizeConfig = async () => {
      try {
        const envResponse = await fetch('/api/config');
        if (!isMounted) return;
        const envApiKeys = await envResponse.json();

        // Update the state just one more time to layer in the server keys.
        // User-entered keys will still have priority due to the merge order.
        setConfig(currentConfig => ({
          ...currentConfig,
          apiKeys: {
            ...initialConfig.apiKeys, // Start with defaults
            ...envApiKeys,           // Layer server keys
            ...currentConfig.apiKeys // Layer user's keys on top
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
  }, []);

  // --- NEW: Effect for SAVING config to localStorage on change ---
  useEffect(() => {
    // Don't save during the initial loading phase
    if (isLoading) {
      return;
    }
    try {
      // We don't need to lz-string compress for localStorage, but we can.
      // Simple JSON is fine.
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
    } catch (error) {
      console.error('Error saving config to localStorage:', error);
    }
  }, [config, isLoading]); // This effect runs whenever `config` or `isLoading` changes.


  if (isLoading) {
    return <div>Loading configuration...</div>;
  }

  return (
    <ConfigContext.Provider value={{ config, setConfig }}>
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
