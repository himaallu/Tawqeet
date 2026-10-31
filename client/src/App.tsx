import { Loader2 } from "lucide-react";
import { Redirect, Route, Switch } from "wouter";
import { AppShell } from "./components/shell";
import { ApiError, useApi, type Me } from "./lib/api";
import { SessionProvider, useSession, useTheme } from "./lib/session";
import { BrainPage } from "./pages/app/brain";
import { CalibrationPage } from "./pages/app/calibration";
import { LeadsPage } from "./pages/app/leads";
import { OverviewPage } from "./pages/app/overview";
import { PlaysPage } from "./pages/app/plays";
import { RadarPage } from "./pages/app/radar";
import { ReportsPage } from "./pages/app/reports";
import { ReviewPage } from "./pages/app/review";
import { LandingPage } from "./pages/landing";
import { LoginPage, OnboardingPage } from "./pages/auth";
import { SettingsPage } from "./pages/settings";

function Splash() {
  return (
    <div className="grid min-h-screen place-items-center text-ink-3">
      <Loader2 className="size-5 animate-spin" />
    </div>
  );
}

function StaffOnly({ children }: { children: React.ReactNode }) {
  const { isStaff } = useSession();
  return isStaff ? <>{children}</> : <Redirect to="/" />;
}

function AppRoutes() {
  useTheme();
  const me = useApi<Me>(["me"], "/me", { retry: false });
  if (me.isLoading) return <Splash />;
  if (me.error instanceof ApiError && me.error.status === 401) return <Redirect to="~/login" />;
  if (!me.data) return <Splash />;
  if (!me.data.agency) return <Redirect to="~/onboarding" />;
  return (
    <SessionProvider me={me.data}>
      <AppShell>
        <Switch>
          <Route path="/" component={OverviewPage} />
          <Route path="/review" component={ReviewPage} />
          <Route path="/reports" component={ReportsPage} />
          <Route path="/radar">{() => <StaffOnly><RadarPage /></StaffOnly>}</Route>
          <Route path="/leads">{() => <StaffOnly><LeadsPage /></StaffOnly>}</Route>
          <Route path="/brain">{() => <StaffOnly><BrainPage /></StaffOnly>}</Route>
          <Route path="/clients/:id/brain">{(p) => <StaffOnly><BrainPage clientId={p.id} /></StaffOnly>}</Route>
          <Route path="/plays">{() => <StaffOnly><PlaysPage /></StaffOnly>}</Route>
          <Route path="/calibration">{() => <StaffOnly><CalibrationPage /></StaffOnly>}</Route>
          <Route path="/settings/:tab?">{(p) => <StaffOnly><SettingsPage tab={p.tab} /></StaffOnly>}</Route>
          <Route>
            <Redirect to="/" />
          </Route>
        </Switch>
      </AppShell>
    </SessionProvider>
  );
}

export function App() {
  return (
    <Switch>
      <Route path="/">{() => <LandingPage />}</Route>
      <Route path="/ar">{() => <LandingPage locale="ar" />}</Route>
      <Route path="/login" component={LoginPage} />
      <Route path="/onboarding" component={OnboardingPage} />
      <Route path="/app" nest>
        <AppRoutes />
      </Route>
      <Route>
        <Redirect to="/" />
      </Route>
    </Switch>
  );
}
