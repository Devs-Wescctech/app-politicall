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

const menuItems = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
    adminOnly: false,
  },
  {
    title: "Contatos",
    url: "/contacts",
    icon: Users,
    adminOnly: false,
  },
  {
    title: "Aliança Política",
    url: "/alliances",
    icon: Handshake,
    adminOnly: false,
  },
  {
    title: "Demandas",
    url: "/demands",
    icon: ClipboardList,
    adminOnly: false,
  },
  {
    title: "Agenda",
    url: "/agenda",
    icon: Calendar,
    adminOnly: false,
  },
  {
    title: "Atendimento IA",
    url: "/ai-attendance",
    icon: Bot,
    adminOnly: false,
  },
  {
    title: "Marketing",
    url: "/marketing",
    icon: Megaphone,
    adminOnly: false,
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
    adminOnly: false,
  },
];

export function AppSidebar() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const { isAdmin } = useCurrentUser();

  const handleLogout = () => {
    removeAuthToken();
    setLocation("/login");
    toast({
      title: "Logout realizado",
      description: "Até logo!",
    });
  };

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-xl font-bold text-primary mb-4">
            Politicall
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems
                .filter(item => !item.adminOnly || isAdmin)
                .map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={location === item.url}>
                      <Link href={item.url} data-testid={`link-${item.url.slice(1)}`}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4">
        <Button 
          variant="outline" 
          className="w-full" 
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
