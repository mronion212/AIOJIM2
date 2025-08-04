import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useConfig } from '@/contexts/ConfigContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

// Define the options for the age rating select dropdown
const ageRatingOptions = [
    { value: 'None', label: 'None (Show All)' },
    { value: 'G', label: 'G (All Ages)' },
    { value: 'PG', label: 'PG (Parental Guidance)' },
    { value: 'PG-13', label: 'PG-13 (Parents Strongly Cautioned)' },
    { value: 'R', label: 'R (Restricted)' },
    { value: 'NC-17', label: 'NC-17 (Adults Only)' },
];

export function FiltersSettings() {
  const { config, setConfig } = useConfig();

  const handleAgeRatingChange = (value: string) => {
    setConfig(prev => ({ ...prev, ageRating: value }));
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-semibold">Content Filters</h2>
        {/* FIX: Use theme-aware text color for descriptions */}
        <p className="text-muted-foreground mt-1">Filter the content displayed in catalogs and search results based on age ratings.</p>
      </div>

      {/* Settings Card */}
      {/* FIX: Remove hard-coded colors. The Card component is already themed. */}
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Content Rating</CardTitle>
          {/* The CardDescription component is already themed. */}
          <CardDescription>
            Select the maximum content rating to display. All content rated higher than your selection will be hidden.
          </CardDescription>
        </CardHeader>
        <CardContent>
            <Select value={config.ageRating} onValueChange={handleAgeRatingChange}>
              {/* FIX: Remove hard-coded colors. The Select components are already themed. */}
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a rating" />
              </SelectTrigger>
              <SelectContent>
                {ageRatingOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
              </SelectContent>
            </Select>
        </CardContent>
      </Card>
    </div>
  );
}
