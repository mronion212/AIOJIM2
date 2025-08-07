import { ThemeToggle } from '../ThemeToggle'; // Make sure this component exists
import { useConfig } from '../../contexts/ConfigContext'; // Adjust the import path as necessary
export function Header() {
  const { addonVersion } = useConfig();
  return (
    <header className="w-full max-w-5xl flex items-center justify-between py-6 sm:py-8">
      <div className="flex items-center space-x-4">
        {/* The Logo Image */}
        <img 
          src="/logo.png" // This path is correct because the image is in the `public` folder
          alt="AIO-Metadata Addon Logo" 
          className="h-12 w-12 sm:h-16 sm:w-16" // Responsive size
        />
        
        {/* The Title and Subtitle */}
        <div className="text-left">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            AIOMetadata <span className="text-sm text-muted-foreground">v{addonVersion}</span>
          </h1>
          <p className="text-md text-muted-foreground mt-1">
            Your one-stop-shop for Stremio metadata.
          </p>
        </div>
      </div>

      {/* Theme Toggle aligned to the right */}
      <div>
        <ThemeToggle />
      </div>
    </header>
  );
}
