import { 
  LayoutDashboard, 
  Users, 
  Handshake, 
  ClipboardList, 
  Calendar, 
  Bot, 
  Megaphone,
  Settings,
  LogOut
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

const menuItems = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Contatos",
    url: "/contacts",
    icon: Users,
  },
  {
    title: "Aliança Política",
    url: "/alliances",
    icon: Handshake,
  },
  {
    title: "Demandas",
    url: "/demands",
    icon: ClipboardList,
  },
  {
    title: "Agenda",
    url: "/agenda",
    icon: Calendar,
  },
  {
    title: "Atendimento IA",
    url: "/ai-attendance",
    icon: Bot,
  },
  {
    title: "Marketing",
    url: "/marketing",
    icon: Megaphone,
  },
  {
    title: "Configurações",
    url: "/settings",
    icon: Settings,
  },
];

export function AppSidebar() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();

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
              {menuItems.map((item) => (
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
