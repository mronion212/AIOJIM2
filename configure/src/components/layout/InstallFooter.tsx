import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useConfig } from '@/contexts/ConfigContext';
import { compressToEncodedURIComponent } from 'lz-string';
import { InstallDialog } from '../InstallDialog'; 
import { toast } from "sonner";

export function InstallFooter() {
  const { config } = useConfig();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [manifestUrl, setManifestUrl] = useState('');

  const handleOpenDialog = () => {
    const tmdbKey = config.apiKeys.tmdb?.trim();
    const tvdbKey = config.apiKeys.tvdb?.trim();
    if (!tmdbKey) {
      toast.error("TMDB API Key is Required", {
        description: "Please go to the 'Integrations' tab and enter your TMDB API key. This is the primary data source for the addon.",
        duration: 5000,
      });
      return; 
    }

    // Check for TVDB key
    if (!tvdbKey) {
      toast.error("TVDB API Key is Required", {
        description: "Please go to the 'Integrations' tab and enter your TVDB API key. This is required for series and anime metadata.",
        duration: 5000,
      });
      return; 
    }
    const configToSerialize = {
      language: config.language,
      includeAdult: config.includeAdult,
      blurThumbs: config.blurThumbs,
      showPrefix: config.showPrefix,
      providers: config.providers,
      tvdbSeasonType: config.tvdbSeasonType,
      apiKeys: config.apiKeys,
      ageRating: config.ageRating,
      catalogs: config.catalogs.filter(c => c.enabled),
      castCount: config.castCount,
      search: config.search,
    };
    

    const compressedConfig = compressToEncodedURIComponent(JSON.stringify(configToSerialize));
    const host = `${window.location.protocol}//${window.location.host}`;
    const generatedManifestUrl = `${host}/${compressedConfig}/manifest.json`;
    
    setManifestUrl(generatedManifestUrl);
    setIsDialogOpen(true);
  };

  return (
    <>
      <footer className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-sm border-t border-border flex justify-center z-40">
        <div className="w-full max-w-5xl flex items-center justify-end">
          <Button 
            size="lg" 
            onClick={handleOpenDialog}
            className="bg-green-600 hover:bg-green-700 text-primary-foreground font-bold text-lg px-8 py-6"
          >
            Install Addon
          </Button>
        </div>
      </footer>
      
      <InstallDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        manifestUrl={manifestUrl}
      />
    </>
  );
}
