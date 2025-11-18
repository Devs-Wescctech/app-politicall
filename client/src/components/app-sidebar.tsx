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
  Shield
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
import { DEFAULT_PERMISSIONS, type UserPermissions } from "@shared/schema";
import logoUrl from "@assets/icon politicall_1763309153389.png";

type MenuItem = {
  title: string;
  url: string;
  icon: any;
  permissionKey?: keyof UserPermissions;
  adminOnly?: boolean;
};

export function AppSidebar() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useCurrentUser();
  
  // Get permissions from backend user or use default assessor permissions
  const permissions: UserPermissions = user?.permissions || DEFAULT_PERMISSIONS.assessor;

  // Define menu items with permission mappings
  const menuItems: MenuItem[] = [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: LayoutDashboard,
      permissionKey: "dashboard",
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
      title: "Atendimento IA",
      url: "/ai-attendance",
      icon: Bot,
      permissionKey: "ai",
    },
    {
      title: "Intenção Pública",
      url: "/marketing",
      icon: Megaphone,
      permissionKey: "marketing",
    },
    {
      title: "Usuários",
      url: "/users",
      icon: Shield,
      permissionKey: "users",
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
    // Configurações é apenas para admin
    if (item.adminOnly) {
      return user?.role === 'admin';
    }
    // Verifica se o usuário tem permissão para este menu
    if (item.permissionKey) {
      return permissions[item.permissionKey] === true;
    }
    // Se não tem permissionKey nem adminOnly, mostra por padrão
    return true;
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
          {user?.avatar ? (
            <img 
              src={user.avatar} 
              alt="Foto de Perfil" 
              className="h-12 w-12 rounded-full object-cover"
              data-testid="avatar-image"
            />
          ) : (
            <img src={logoUrl} alt="Logo" className="h-12 w-auto" />
          )}
          {user?.name && (
            <div className="flex flex-col">
              <span className="text-base font-semibold text-foreground" data-testid="text-user-name">
                {getShortName(user.name)}
              </span>
              {user?.party && (
                <span className="text-[11px] text-muted-foreground" data-testid="text-party-ideology">
                  {user.party.acronym} | {user.party.ideology} | {getRoleLabel(user.role)}
                </span>
              )}
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
      <SidebarFooter className="p-4">
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
