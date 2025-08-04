import React, { createContext, useContext, useState, useEffect } from "react";
import { AppConfig, CatalogConfig, SearchConfig } from "./configTypes";
import { decompressFromEncodedURIComponent } from 'lz-string';
import { allCatalogDefinitions, allSearchProviders } from "@/data/catalogs"; 

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
  const [config, setConfig] = useState<AppConfig>(initialConfig);
  const [isLoading, setIsLoading] = useState(true);

  // --- THIS IS THE IMPLEMENTED LOGIC ---
  useEffect(() => {
    async function loadInitialConfig() {
      try {
        // First, try to fetch the environment variables from our new API endpoint.
        const envResponse = await fetch('/api/config');
        const envApiKeys = await envResponse.json();

        // Check for a config in the URL, which should take priority.
        const path = window.location.pathname.split('/')[1];
        if (path && path.toLowerCase() !== 'configure') {
          const decompressed = decompressFromEncodedURIComponent(path);
          const urlConfig = JSON.parse(decompressed);
          
          console.log('[Config] Hydrating state from URL...');
          // Merge the loaded URL config on top of the env vars and defaults.
          setConfig(prev => ({
            ...prev, // Start with defaults
            ...urlConfig, // Apply URL config
            apiKeys: { ...prev.apiKeys, ...envApiKeys, ...urlConfig.apiKeys }, // Env < URL
          }));
          window.history.replaceState({}, '', '/configure');
        } else {
          // If no config in URL, just apply the environment variables.
          console.log('[Config] Hydrating state from server environment...');
          setConfig(prev => ({
            ...prev,
            apiKeys: { ...prev.apiKeys, ...envApiKeys },
          }));
        }
      } catch (error) {
        console.error('Error loading initial config:', error);
        // If anything fails, we just stick with the default state.
      } finally {
        setIsLoading(false); // We're done loading
      }
    }

    loadInitialConfig();
  }, []); // Runs once on mount

  // You can optionally show a loading spinner while the config is being fetched.
  if (isLoading) {
    return <div>Loading configuration...</div>; // Or a nice spinner component
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
