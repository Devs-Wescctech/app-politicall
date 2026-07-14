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

import { lazy, Suspense, type CSSProperties, type ReactNode } from "react";
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

const NotFound = lazy(() => import("@/pages/not-found"));
const Login = lazy(() => import("@/pages/login"));
const Register = lazy(() => import("@/pages/register"));
const AdminLogin = lazy(() => import("@/pages/admin-login"));
const Admin = lazy(() => import("@/pages/admin"));
const Contracts = lazy(() => import("@/pages/contracts"));
const Dashboard = lazy(() => import("@/pages/dashboard"));
const Contacts = lazy(() => import("@/pages/contacts"));
const Alliances = lazy(() => import("@/pages/alliances"));
const Demands = lazy(() => import("@/pages/demands"));
const Agenda = lazy(() => import("@/pages/agenda"));
const AiAttendance = lazy(() => import("@/pages/ai-attendance"));
const Marketing = lazy(() => import("@/pages/marketing"));
const Settings = lazy(() => import("@/pages/settings"));
const UsersManagement = lazy(() => import("@/pages/users"));
const Petitions = lazy(() => import("@/pages/petitions"));
const Attendance = lazy(() => import("@/pages/attendance"));
const Broadcasts = lazy(() => import("@/pages/broadcasts"));
const CampaignDetail = lazy(() => import("@/pages/campaign-detail"));
const Reports = lazy(() => import("@/pages/reports"));
const SurveyLanding = lazy(() => import("@/pages/survey-landing"));
const PetitionPublic = lazy(() => import("@/pages/petition-public"));
const LinkBioPublic = lazy(() => import("@/pages/linkbio-public"));
const LinkTreePublic = lazy(() => import("@/pages/linktree-public"));
const PublicSupport = lazy(() => import("@/pages/public-support"));
const AllianceInvitePage = lazy(() => import("@/pages/alliance-invite"));
const LandingPage = lazy(() => import("@/pages/landing"));
const ThankYouPage = lazy(() => import("@/pages/thank-you"));
const AdminManual = lazy(() => import("@/pages/admin-manual"));
const Manual = lazy(() => import("@/pages/manual"));

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
      Carregando...
    </div>
  );
}

function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as CSSProperties}>
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

function AuthenticatedPage({ children }: { children: ReactNode }) {
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
          <Suspense fallback={<RouteFallback />}>
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
              <Route path="/broadcasts/:id">
                <AuthenticatedPage>
                  <CampaignDetail />
                </AuthenticatedPage>
              </Route>
              <Route path="/broadcasts">
                <AuthenticatedPage>
                  <Broadcasts />
                </AuthenticatedPage>
              </Route>
              <Route path="/reports">
                <AuthenticatedPage>
                  <Reports />
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
          </Suspense>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
