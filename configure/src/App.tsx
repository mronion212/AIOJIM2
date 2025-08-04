import { Card, CardContent } from "@/components/ui/card";
import { Header } from './components/layout/Header';
import { InstallFooter } from './components/layout/InstallFooter';
import { SettingsLayout } from './components/SettingsLayout';
import { Toaster } from "@/components/ui/sonner";

function App() {
  return (
    // The main div no longer needs to be a flex container.
    // Padding-bottom is added to prevent content from hiding behind the footer.
    <div className="min-h-screen w-full bg-background text-foreground p-4 sm:p-6 pb-28">
      <div className="w-full max-w-5xl mx-auto">
        <Header />
        <Card className="shadow-2xl">
          <CardContent className="p-6 md:p-8">
            <SettingsLayout />
          </CardContent>
        </Card>
      </div>
      <InstallFooter />
      <Toaster />
    </div>
  );
}
export default App;
