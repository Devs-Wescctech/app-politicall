import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ProtectedRoute } from "@/components/protected-route";
import { AdminRoute } from "@/components/admin-route";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/notification-bell";
import { isAuthenticated } from "@/lib/auth";
import logoUrl from "@assets/logo pol_1763308638963.png";

import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Register from "@/pages/register";
import AdminLogin from "@/pages/admin-login";
import Admin from "@/pages/admin";
import Contracts from "@/pages/contracts";
import Dashboard from "@/pages/dashboard";
import Contacts from "@/pages/contacts";
import Alliances from "@/pages/alliances";
import Demands from "@/pages/demands";
import Agenda from "@/pages/agenda";
import AiAttendance from "@/pages/ai-attendance";
import Marketing from "@/pages/marketing";
import Settings from "@/pages/settings";
import UsersManagement from "@/pages/users";
import Petitions from "@/pages/petitions";
import SurveyLanding from "@/pages/survey-landing";
import PublicSupport from "@/pages/public-support";
import LandingPage from "@/pages/landing";
import ThankYouPage from "@/pages/thank-you";

function AuthenticatedLayout() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full overflow-hidden">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
          <header className="flex items-center justify-between p-4 border-b bg-background shrink-0">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <img src={logoUrl} alt="Logo" className="h-8" />
            <div className="flex items-center gap-2">
              <NotificationBell />
              <ThemeToggle />
            </div>
          </header>
          <main className="flex-1 overflow-y-auto">
            <Switch>
              <Route path="/dashboard">
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              </Route>
              <Route path="/contacts">
                <ProtectedRoute>
                  <Contacts />
                </ProtectedRoute>
              </Route>
              <Route path="/alliances">
                <ProtectedRoute>
                  <Alliances />
                </ProtectedRoute>
              </Route>
              <Route path="/demands">
                <ProtectedRoute>
                  <Demands />
                </ProtectedRoute>
              </Route>
              <Route path="/agenda">
                <ProtectedRoute>
                  <Agenda />
                </ProtectedRoute>
              </Route>
              <Route path="/ai-attendance">
                <ProtectedRoute>
                  <AiAttendance />
                </ProtectedRoute>
              </Route>
              <Route path="/marketing">
                <ProtectedRoute>
                  <Marketing />
                </ProtectedRoute>
              </Route>
              <Route path="/petitions">
                <ProtectedRoute>
                  <Petitions />
                </ProtectedRoute>
              </Route>
              <Route path="/settings">
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              </Route>
              <Route path="/users">
                <ProtectedRoute>
                  <AdminRoute>
                    <UsersManagement />
                  </AdminRoute>
                </ProtectedRoute>
              </Route>
              <Route component={NotFound} />
            </Switch>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Switch>
            <Route path="/login" component={Login} />
            <Route path="/register" component={Register} />
            <Route path="/admin-login" component={AdminLogin} />
            <Route path="/admin" component={Admin} />
            <Route path="/contracts" component={Contracts} />
            <Route path="/pesquisa/:slug" component={SurveyLanding} />
            <Route path="/apoio/:slug" component={PublicSupport} />
            <Route path="/thank-you" component={ThankYouPage} />
            <Route path="/" component={LandingPage} />
            <Route path="/:rest*">
              {() => {
                if (!isAuthenticated()) {
                  return <Redirect to="/login" />;
                }
                return <AuthenticatedLayout />;
              }}
            </Route>
          </Switch>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
