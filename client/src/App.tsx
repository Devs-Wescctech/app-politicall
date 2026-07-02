/**
 * ============================================================================
 * POLITICALL - Plataforma de Gestão Política
 * ============================================================================
 * 
 * Desenvolvido por: David Flores Andrade
 * Website: www.politicall.com.br
 * 
 * Todos os direitos reservados © 2024-2025
 * ============================================================================
 */

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
import Attendance from "@/pages/attendance";
import Broadcasts from "@/pages/broadcasts";
import SurveyLanding from "@/pages/survey-landing";
import PetitionPublic from "@/pages/petition-public";
import LinkBioPublic from "@/pages/linkbio-public";
import LinkTreePublic from "@/pages/linktree-public";
import PublicSupport from "@/pages/public-support";
import AllianceInvitePage from "@/pages/alliance-invite";
import LandingPage from "@/pages/landing";
import ThankYouPage from "@/pages/thank-you";
import AdminManual from "@/pages/admin-manual";
import Manual from "@/pages/manual";

function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
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
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function AuthenticatedPage({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Redirect to="/login" />;
  }

  return (
    <ProtectedRoute>
      <AuthenticatedLayout>{children}</AuthenticatedLayout>
    </ProtectedRoute>
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
            <Route path="/admin/manual" component={AdminManual} />
            <Route path="/contracts" component={Contracts} />
            <Route path="/pesquisa/:slug" component={SurveyLanding} />
            <Route path="/p/:slug" component={PetitionPublic} />
            <Route path="/bio/:slug" component={LinkBioPublic} />
            <Route path="/tree/:slug" component={LinkTreePublic} />
            <Route path="/apoio/:slug/:volunteerCode" component={PublicSupport} />
            <Route path="/apoio/:slug" component={PublicSupport} />
            <Route path="/convite-alianca/:token" component={AllianceInvitePage} />
            <Route path="/thank-you" component={ThankYouPage} />
            <Route path="/" component={LandingPage} />
            <Route path="/dashboard">
              <AuthenticatedPage>
                <Dashboard />
              </AuthenticatedPage>
            </Route>
            <Route path="/contacts">
              <AuthenticatedPage>
                <Contacts />
              </AuthenticatedPage>
            </Route>
            <Route path="/alliances">
              <AuthenticatedPage>
                <Alliances />
              </AuthenticatedPage>
            </Route>
            <Route path="/demands">
              <AuthenticatedPage>
                <Demands />
              </AuthenticatedPage>
            </Route>
            <Route path="/agenda">
              <AuthenticatedPage>
                <Agenda />
              </AuthenticatedPage>
            </Route>
            <Route path="/ai-attendance">
              <AuthenticatedPage>
                <AiAttendance />
              </AuthenticatedPage>
            </Route>
            <Route path="/marketing">
              <AuthenticatedPage>
                <Marketing />
              </AuthenticatedPage>
            </Route>
            <Route path="/petitions">
              <AuthenticatedPage>
                <Petitions />
              </AuthenticatedPage>
            </Route>
            <Route path="/attendance">
              <AuthenticatedPage>
                <Attendance />
              </AuthenticatedPage>
            </Route>
            <Route path="/broadcasts">
              <AuthenticatedPage>
                <Broadcasts />
              </AuthenticatedPage>
            </Route>
            <Route path="/settings">
              <AuthenticatedPage>
                <Settings />
              </AuthenticatedPage>
            </Route>
            <Route path="/users">
              <AuthenticatedPage>
                <AdminRoute>
                  <UsersManagement />
                </AdminRoute>
              </AuthenticatedPage>
            </Route>
            <Route path="/manual">
              <AuthenticatedPage>
                <Manual />
              </AuthenticatedPage>
            </Route>
            <Route component={NotFound} />
          </Switch>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
