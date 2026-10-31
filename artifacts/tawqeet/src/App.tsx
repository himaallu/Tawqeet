import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Redirect, useLocation, Router as WouterRouter } from 'wouter';
import { useGetSession, getGetSessionQueryKey } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppShell } from '@/components/app-shell';
import { Mark } from '@/components/brand';
import { ErrorPanel } from '@/components/states';
import { apiErrorMessage } from '@/lib/api-error';
import NotFound from '@/pages/not-found';
import LoginPage from '@/pages/login';
import ConfirmPage from '@/pages/confirm';
import ClientsPage from '@/pages/clients';
import ClientDetailPage from '@/pages/client-detail';
import SettingsPage from '@/pages/settings';
import SystemPage from '@/pages/system';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

function Gate() {
  const session = useGetSession({ query: { queryKey: getGetSessionQueryKey() } });
  const [location] = useLocation();

  if (location === '/auth/confirm') {
    if (session.data?.user) return <Redirect to="/clients" />;
    return <ConfirmPage />;
  }
  if (session.isLoading) return (
    <div className="min-h-[100dvh] grid place-items-center" aria-busy="true"><Mark className="h-10 w-10 animate-pulse" /></div>
  );
  if (session.isError || !session.data) return (
    <div className="min-h-[100dvh] grid place-items-center p-6"><div className="max-w-md w-full"><ErrorPanel title="Cannot reach Tawqeet" message={apiErrorMessage(session.error)} onRetry={() => session.refetch()} /></div></div>
  );
  const user = session.data.user;
  if (!user) return <LoginPage loginConfigured={session.data.loginConfigured} />;

  return (
    <AppShell user={user}>
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/"><Redirect to="/clients" /></Route>
          <Route path="/login"><Redirect to="/clients" /></Route>
          <Route path="/clients"><ClientsPage user={user} /></Route>
          <Route path="/clients/:id"><ClientDetailPage user={user} /></Route>
          <Route path="/settings"><SettingsPage user={user} /></Route>
          <Route path="/settings/system"><SystemPage user={user} /></Route>
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </AppShell>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Gate />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
