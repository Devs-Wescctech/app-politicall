import { 
  LayoutDashboard, 
  Users, 
  Handshake, 
  ClipboardList, 
  Calendar, 
  Bot, 
  Megaphone,
  Settings,
  LogOut,
  Shield,
  ScrollText,
  Info
} from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { removeAuthToken } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useQuery } from "@tanstack/react-query";
import { DEFAULT_PERMISSIONS, type UserPermissions } from "@shared/schema";
import logoUrl from "@assets/icon politicall_1763309153389.png";

type MenuItem = {
  title: string;
  url: string;
  icon: any;
  permissionKey?: keyof UserPermissions;
  adminOnly?: boolean;
  alwaysVisible?: boolean;
};

export function AppSidebar() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useCurrentUser();
  
  // Fetch admin information for sidebar header
  const { data: adminData } = useQuery<any>({
    queryKey: ["/api/account/admin"],
    enabled: !!user, // Only fetch when user is logged in
  });
  
  // Get permissions from backend user - NO fallback to default permissions
  // Non-admin users see ONLY modules they have explicit permission for
  const permissions: UserPermissions = user?.permissions || {
    dashboard: false,
    contacts: false,
    alliances: false,
    demands: false,
    agenda: false,
    ai: false,
    marketing: false,
    petitions: false,
    users: false,
    settings: false,
  };

  // Define menu items with permission mappings
  const menuItems: MenuItem[] = [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: LayoutDashboard,
      alwaysVisible: true,
    },
    {
      title: "Eleitores",
      url: "/contacts",
      icon: Users,
      permissionKey: "contacts",
    },
    {
      title: "Alianças Políticas",
      url: "/alliances",
      icon: Handshake,
      permissionKey: "alliances",
    },
    {
      title: "Demandas",
      url: "/demands",
      icon: ClipboardList,
      permissionKey: "demands",
    },
    {
      title: "Agenda",
      url: "/agenda",
      icon: Calendar,
      permissionKey: "agenda",
    },
    {
      title: "Pesquisas de Intenção",
      url: "/marketing",
      icon: Megaphone,
      permissionKey: "marketing",
    },
    {
      title: "Atendimento IA",
      url: "/ai-attendance",
      icon: Bot,
      permissionKey: "ai",
    },
    {
      title: "Petições",
      url: "/petitions",
      icon: ScrollText,
      permissionKey: "petitions",
    },
    {
      title: "Usuários",
      url: "/users",
      icon: Shield,
      adminOnly: true,
    },
    {
      title: "Configurações",
      url: "/settings",
      icon: Settings,
      adminOnly: true,
    },
  ];
  
  // Filter menu items based on permissions
  const visibleItems = menuItems.filter(item => {
    // Itens sempre visíveis para todos (apenas Dashboard)
    if (item.alwaysVisible) {
      return true;
    }

    // Itens exclusivos para admin (Usuários, Configurações)
    // Admins sempre veem estes itens
    if (item.adminOnly) {
      return user?.role === "admin";
    }

    // Verifica se o usuário tem permissão explícita para este menu
    // Isso vale para TODOS os usuários, incluindo admins
    if (item.permissionKey) {
      return permissions[item.permissionKey] === true;
    }

    // Se não tem permissionKey, alwaysVisible ou adminOnly, não mostra
    return false;
  });

  const handleLogout = () => {
    removeAuthToken();
    window.location.href = "/login";
  };

  // Extract first and last name
  const getShortName = (fullName?: string) => {
    if (!fullName) return "";
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0];
    return `${parts[0]} ${parts[parts.length - 1]}`;
  };

  // Traduzir role para português
  const getRoleLabel = (role?: string) => {
    if (!role) return "";
    switch (role) {
      case "admin": return "Admin";
      case "coordenador": return "Coordenador";
      case "assessor": return "Assessor";
      default: return role;
    }
  };

  return (
    <Sidebar>
      <div className="sticky top-0 z-50 bg-sidebar px-4 py-6 border-b shadow-md">
        <div className="flex items-center gap-3">
          {adminData?.avatar ? (
            <img 
              src={adminData.avatar} 
              alt="Foto do Admin" 
              className="h-12 w-12 rounded-full object-cover"
              data-testid="avatar-image"
            />
          ) : (
            <img src={logoUrl} alt="Logo" className="h-12 w-auto" />
          )}
          {adminData?.name && (
            <div className="flex flex-col">
              <span className="text-base font-semibold text-foreground" data-testid="text-user-name">
                {getShortName(adminData.name)}
              </span>
              <span className="text-[11px] text-muted-foreground" data-testid="text-party-ideology">
                {adminData?.party 
                  ? `${adminData.party.acronym} | ${adminData.party.ideology} | ${getRoleLabel(user?.role)}`
                  : getRoleLabel(user?.role)
                }
              </span>
            </div>
          )}
        </div>
      </div>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-2">
              {visibleItems.map((item) => {
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.title} className="border-b border-muted-foreground/20 pb-2 mx-4">
                    <Link 
                      href={item.url} 
                      data-testid={`link-${item.url.slice(1)}`}
                      className={`flex items-center gap-2 py-2 px-2 ${isActive ? "text-primary" : ""}`}
                    >
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 space-y-2">
        <Button 
          variant="ghost" 
          className="w-full justify-start opacity-50 text-[12px]" 
          onClick={() => setLocation("/manual")}
          data-testid="button-info"
        >
          <Info className="w-4 h-4 mr-2" />
          Informacoes
        </Button>
        <Button 
          variant="outline" 
          className="w-full rounded-full" 
          onClick={handleLogout}
          data-testid="button-logout"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sair
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
