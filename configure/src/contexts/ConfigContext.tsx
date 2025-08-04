import React, { createContext, useContext, useState, useEffect } from "react";
import { AppConfig, CatalogConfig, SearchConfig } from "./configTypes";
import { decompressFromEncodedURIComponent } from 'lz-string';
import { allCatalogDefinitions, allSearchProviders } from "@/data/catalogs"; 
const injectedEnv = (window as any).injectedEnv || {};

interface ConfigContextType {
  config: AppConfig;
  setConfig: React.Dispatch<React.SetStateAction<AppConfig>>;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

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
    tmdb: injectedEnv.tmdb || "",
    tvdb: injectedEnv.tvdb || "",
    fanart: injectedEnv.fanart || "", 
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
  const [config, setConfig] = useState<AppConfig>(initialConfig);

  // --- THIS IS THE IMPLEMENTED LOGIC ---
  useEffect(() => {
    const loadConfigFromUrl = () => {
      try {
        const pathParts = window.location.pathname.split('/');
        // A valid config URL will have a structure like ['', 'CONFIG_STRING', 'configure']
        // So, we look for the part before 'configure'.
        const configStringIndex = pathParts.findIndex(p => p.toLowerCase() === 'configure');
        
        if (configStringIndex <= 0 || !pathParts[configStringIndex - 1]) {
          // No config string found in the URL. Use the default state.
          console.log('[Config] No config in URL, using defaults.');
          return;
        }

        const compressedConfig = pathParts[configStringIndex - 1];
        console.log('[Config] Found config string in URL. Decompressing...');

        const decompressed = decompressFromEncodedURIComponent(compressedConfig);
        if (!decompressed) {
          throw new Error("Decompression resulted in an empty string.");
        }
        
        const urlConfig = JSON.parse(decompressed);
        console.log('[Config] Successfully parsed config:', urlConfig);

        // --- State Hydration ---
        // We will create a new state object by merging the loaded config
        // with our default structure to ensure all properties exist.

        // First, handle the catalogs. We need to merge the user's choices
        // with the full list of definitions to get names, etc.
        const loadedCatalogs = allCatalogDefinitions.map(def => {
          const userSetting = urlConfig.catalogs?.find((c: CatalogConfig) => c.id === def.id && c.type === def.type);
          return {
            id: def.id,
            name: def.name,
            type: def.type,
            enabled: userSetting ? userSetting.enabled : false, // Default to disabled if not in user's list
            showInHome: userSetting ? userSetting.showInHome : false,
          };
        });

        setConfig(prevConfig => ({
          ...prevConfig, // Start with the default structure
          ...urlConfig,   // Overwrite with all simple values from the URL
          apiKeys: { ...prevConfig.apiKeys, ...urlConfig.apiKeys }, // Deep merge apiKeys
          providers: { ...prevConfig.providers, ...urlConfig.providers }, // Deep merge providers
          search: { ...prevConfig.search, ...urlConfig.search },
          catalogs: loadedCatalogs, // Use the carefully merged catalog list
        }));

        // Clean the URL to a simple '/configure' for a better user experience.
        window.history.replaceState({}, '', '/configure');
        console.log('[Config] State hydrated from URL and URL cleaned.');

      } catch (error) {
        console.error('Error loading config from URL:', error);
        // If loading or parsing fails, we simply fall back to the default config.
        // The `useState(initialConfig)` already handles this.
      }
    };

    loadConfigFromUrl();
  }, []); // The empty dependency array `[]` ensures this effect runs only once when the component mounts.

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
