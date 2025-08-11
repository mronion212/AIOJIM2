import React, { useState, useCallback } from 'react';
import { useConfig,  CatalogConfig} from '@/contexts/ConfigContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Loader2 } from 'lucide-react';
import { toast } from "sonner";

interface MDBListIntegrationProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MDBListIntegration({ isOpen, onClose }: MDBListIntegrationProps) {
  const { config, setConfig } = useConfig();
  const [tempKey, setTempKey] = useState(config.apiKeys.mdblist || "");
  const [isValid, setIsValid] = useState(!!config.apiKeys.mdblist);
  const [isChecking, setIsChecking] = useState(false);
  const [customListUrl, setCustomListUrl] = useState("");

  const validateApiKey = useCallback(async (key: string, isRefresh: boolean = false): Promise<boolean> => {
    if (!key) {
      setIsValid(false);
      return false;
    }
    setIsChecking(true);
    try {
      const response = await fetch(`https://api.mdblist.com/lists/user?apikey=${key}`);
      if (!response.ok) throw new Error(`Failed to fetch lists (Status: ${response.status})`);
      
      const listsFromApi = await response.json();
      const newCatalogsFromApi = listsFromApi.map((list: any) => ({
        id: `mdblist.${list.id}`,
        name: list.name,
        type: list.mediatype === "movie" ? "movie" : "series",
        enabled: true,
        showInHome: true,
        source: 'mdblist',
      }));

      let newListsAddedCount = 0;
      
      setConfig(prev => {
        const otherCatalogs = prev.catalogs.filter(c => !c.id.startsWith("mdblist."));
        const existingMdbListIds = new Set(prev.catalogs.filter(c => c.id.startsWith("mdblist.")).map(c => c.id));

        const updatedMdbCatalogs = [...prev.catalogs.filter(c => c.id.startsWith("mdblist."))];

        newCatalogsFromApi.forEach((apiCatalog: CatalogConfig) => {
            if (!existingMdbListIds.has(apiCatalog.id)) {
                updatedMdbCatalogs.push(apiCatalog);
                newListsAddedCount++;
            }
        });

        return {
          ...prev,
          catalogs: [...otherCatalogs, ...updatedMdbCatalogs],
        };
      });

      if (isRefresh) {
        if (newListsAddedCount > 0) {
          toast.success("Lists Refreshed", {
            description: `${newListsAddedCount} new list(s) were found and added to your catalogs.`
          });
        } else {
          const currentMdbListCount = newCatalogsFromApi.length;
          toast.info("Lists Up to Date", {
            description: `No new lists found. Your ${currentMdbListCount} MDBList catalog(s) are already synced.`
          });
        }
      } else {
        toast.success(`Successfully imported ${listsFromApi.length} lists from your MDBList account.`);
      }
    
      
      setIsValid(true);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "An unknown error occurred.";
      toast.error("API Key Validation Failed", { description: message });
      setIsValid(false);
      return false;
    } finally {
      setIsChecking(false);
    }
  }, [setConfig]);

  const handleSave = () => {
    if (isValid) {
      setConfig(prev => ({ ...prev, apiKeys: { ...prev.apiKeys, mdblist: tempKey } }));
      onClose(); // Close the dialog on save
    }
  };

  const handleAddCustomList = async () => {
    if (!tempKey) {
        toast.error("Please enter your MDBList API key first.");
        return;
    }
    try {
      const path = new URL(customListUrl).pathname;
      const listName = path.replace('/lists/', '');
      if (!listName) throw new Error("Invalid MDBList URL format.");

      const response = await fetch(`https://api.mdblist.com/lists/${listName}?apikey=${tempKey}`);
      if (!response.ok) throw new Error(`Error fetching list (Status: ${response.status})`);

      const [list] = await response.json();
      const type = list.mediatype === "movie" ? "movie" : "series";
      const newCatalog: CatalogConfig = {
        id: `mdblist.${list.id}`,
        type,
        name: list.name,
        enabled: true,
        showInHome: true,
        source: 'mdblist',
      };

      setConfig(prev => {
        // Prevent duplicates
        if (prev.catalogs.some(c => c.id === newCatalog.id)) {
            toast.info(`List "${list.name}" is already in your catalog list.`);
            return prev;
        }
        return { ...prev, catalogs: [...prev.catalogs, newCatalog] };
      });

      toast.success("List Added", { description: `The list "${list.name}" has been added to your catalogs.` });
      setCustomListUrl("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "An unknown error occurred.";
      toast.error("Error Adding List", { description: message });
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>MDBList Integration</DialogTitle>
          <DialogDescription>
            Import your public and private lists from MDBList.com to use as catalogs.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="mdblistkey">MDBList API Key</Label>
            <Input id="mdblistkey" value={tempKey} onChange={(e) => setTempKey(e.target.value)} placeholder="Enter your MDBList API key" />
            <a href="https://mdblist.com/preferences/#api_key_uid" target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:underline">
              Where do I get this?
            </a>
          </div>
          {isValid && (
            <div className="space-y-2 pt-4 border-t border-border">
              <Label htmlFor="customListUrl">Add Another User's Public List by URL</Label>
              <div className="flex items-center space-x-2">
                <Input id="customListUrl" value={customListUrl} onChange={(e) => setCustomListUrl(e.target.value)} placeholder="https://mdblist.com/lists/user/list-name" />
                <Button onClick={handleAddCustomList} variant="outline">Add</Button>
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="sm:justify-between">
            <div>
              {isValid && (
                <Button variant="outline" onClick={() => validateApiKey(tempKey, true)} disabled={isChecking}>
                  {isChecking ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Refreshing...</>) : ("Refresh My Lists")}
                </Button>
              )}
            </div>

            <div className="flex space-x-2">
                <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
                {isValid ? (
                  <Button onClick={handleSave}>Save & Close</Button>
                ) : (
                  <Button onClick={() => validateApiKey(tempKey, false)} disabled={!tempKey || isChecking}>
                    {isChecking ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Checking...</>) : ("Check Key & Import My Lists")}
                  </Button>
                )}
            </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}