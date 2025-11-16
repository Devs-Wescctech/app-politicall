import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ProtectedRoute } from "@/components/protected-route";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { isAuthenticated } from "@/lib/auth";

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
          {isAuthenticated() ? (
            <SidebarProvider style={style as React.CSSProperties}>
              <div className="flex h-screen w-full">
                <AppSidebar />
                <div className="flex flex-col flex-1 overflow-hidden">
                  <header className="flex items-center justify-between p-4 border-b bg-background">
                    <SidebarTrigger data-testid="button-sidebar-toggle" />
                    <div className="text-xl font-bold text-primary">Politicall</div>
                    <ThemeToggle />
                  </header>
                  <main className="flex-1 overflow-y-auto">
                    <Router />
                  </main>
                </div>
              </div>
            </SidebarProvider>
          ) : (
            <Router />
          )}
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
