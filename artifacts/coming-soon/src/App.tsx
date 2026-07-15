import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();

// The production token-screener URL is injected via VITE_APP_URL (see
// vercel env / .env.example) rather than hardcoded, so this button can be
// repointed to a consolidated domain later without a code change. If the
// env var isn't set (e.g. a fresh local checkout), the button is hidden
// instead of linking nowhere.
const APP_URL = import.meta.env.VITE_APP_URL as string | undefined;

function Home() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background bg-[radial-gradient(circle_at_50%_0%,hsl(var(--card))_0%,hsl(var(--background))_60%)] px-6">
      <div className="text-center">
        <div className="mb-4 flex items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.25em] text-primary">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          Robinhood Chain · 4663
        </div>
        <h1 className="font-sans text-4xl font-bold text-foreground sm:text-6xl">
          ApeScreener
        </h1>
        <p className="mx-auto mt-4 max-w-md text-sm text-muted-foreground sm:text-base">
          The live token screener for ape.store launches on Robinhood Chain is almost ready.
        </p>
        {APP_URL && (
          <a
            href={APP_URL}
            className="mt-8 inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 font-mono text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Enter App
            <span aria-hidden>→</span>
          </a>
        )}
      </div>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
