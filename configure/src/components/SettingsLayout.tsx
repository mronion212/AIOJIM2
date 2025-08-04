import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useBreakpoint } from '@/hooks/use-breakpoint';

// Import all your settings page components
import { GeneralSettings } from './sections/GeneralSettings';
import { IntegrationsSettings } from './sections/IntegrationsSettings';
import { ProvidersSettings } from './sections/ProvidersSettings';
import { FiltersSettings } from './sections/FiltersSettings';
import { CatalogsSettings } from './sections/CatalogsSettings';
import { SearchSettings } from './sections/SearchSettings';
// You could add an "About" page here in the future

// Define the content for each settings page in a single, clean array.
// This makes it easy to add, remove, or reorder pages later.
const settingsPages = [
  { value: 'general', title: 'General', component: <GeneralSettings /> },
  { value: 'integrations', title: 'Integrations', component: <IntegrationsSettings /> },
  { value: 'providers', title: 'Providers', component: <ProvidersSettings /> },
  { value: 'filters', title: 'Filters', component: <FiltersSettings /> },
  { value: 'search', title: 'Search', component: <SearchSettings /> },
  { value: 'catalogs', title: 'Catalogs', component: <CatalogsSettings /> },
];

/**
 * A responsive layout component that displays settings in Tabs on desktop
 * and in an Accordion on mobile devices.
 */
export function SettingsLayout() {
  // Use our custom hook to determine if we're on a mobile-sized screen.
  const { isMobile } = useBreakpoint();

  // --- RENDER ACCORDION ON MOBILE ---
  if (isMobile) {
    return (
      <Accordion type="single" collapsible className="w-full">
        {settingsPages.map((page, index) => (
          <AccordionItem 
            value={page.value} 
            key={page.value}
            // FIX: Use theme-aware border
            className={index === settingsPages.length - 1 ? "border-b-0" : "border-b"}
          >
            <AccordionTrigger className="text-lg font-medium hover:no-underline py-4">
              {page.title}
            </AccordionTrigger>
            <AccordionContent className="pt-2 pb-6">{page.component}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    );
  }

  return (
    <Tabs defaultValue="general" className="w-full">
      <TabsList 
        className={`grid w-full grid-cols-6 
        // FIX: Replaced bg-gray-900 with theme-aware colors
        bg-muted text-muted-foreground`}
      >
        {settingsPages.map((page) => (
          <TabsTrigger key={page.value} value={page.value} className="text-base">
            {page.title}
          </TabsTrigger>
        ))}
      </TabsList>
      {settingsPages.map((page) => (
        <TabsContent key={page.value} value={page.value} className="mt-6 animate-fade-in">
          {page.component}
        </TabsContent>
      ))}
    </Tabs>
  );
}
