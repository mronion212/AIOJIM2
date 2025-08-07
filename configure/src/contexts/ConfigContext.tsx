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

  try {
    const pathParts = window.location.pathname.split('/');
    const configStringIndex = pathParts.findIndex(p => p.toLowerCase() === 'configure');
    if (configStringIndex > 0 && pathParts[configStringIndex - 1]) {
      const decompressed = decompressFromEncodedURIComponent(pathParts[configStringIndex - 1]);
      if (decompressed) {
        console.log('[Config] Initialized from URL.');
        initialConfigFromSources = JSON.parse(decompressed);
        window.history.replaceState({}, '', '/configure'); 
        return initialConfigFromSources;
      }
    }
  } catch (e) { /* Fall through */ }

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
  blurThumbs: false,
  showPrefix: false, 
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
  // This part is all correct
  const [addonVersion, setAddonVersion] = useState<string>(' ');
  const [preloadedConfig] = useState(initializeConfigFromSources);
  const [config, setConfig] = useState<AppConfig>(() => {
    if (preloadedConfig) {
      return {
        // ... (your robust merging logic here is correct)
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
