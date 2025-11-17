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
import Dashboard from "@/pages/dashboard";
import Contacts from "@/pages/contacts";
import Alliances from "@/pages/alliances";
import Demands from "@/pages/demands";
import Agenda from "@/pages/agenda";
import AiAttendance from "@/pages/ai-attendance";
import Marketing from "@/pages/marketing";
import Settings from "@/pages/settings";
import UsersManagement from "@/pages/users";

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/">
        {() => {
          if (!isAuthenticated()) {
            return <Redirect to="/login" />;
          }
          return <Redirect to="/dashboard" />;
        }}
      </Route>
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
  );
}

function App() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <SidebarProvider style={style as React.CSSProperties}>
            <div className="flex min-h-screen w-full overflow-hidden">
              {isAuthenticated() && <AppSidebar />}
              <div className="flex flex-col flex-1 min-w-0">
                {isAuthenticated() && (
                  <header className="sticky top-0 z-50 flex items-center justify-between p-4 border-b bg-background shrink-0">
                    <SidebarTrigger data-testid="button-sidebar-toggle" />
                    <img src={logoUrl} alt="Logo" className="h-8" />
                    <div className="flex items-center gap-2">
                      <NotificationBell />
                      <ThemeToggle />
                    </div>
                  </header>
                )}
                <main className="flex-1 overflow-hidden">
                  <Router />
                </main>
              </div>
            </div>
          </SidebarProvider>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
