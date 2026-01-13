import { useLocation } from "wouter";
import { Inbox, FileText, Search, Megaphone, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

interface AdminBottomNavProps {
  activePage: "dashboard" | "contracts";
  onInboxClick?: () => void;
  onSearchClick?: () => void;
}

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
  testId: string;
  badge?: number;
}

function NavItem({ icon, label, isActive, onClick, testId, badge }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-center justify-center gap-1 h-full min-h-[44px] flex-1 transition-colors",
        "hover-elevate active-elevate-2",
        isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
      )}
      data-testid={testId}
    >
      <div className="relative flex items-center justify-center">
        {icon}
        {badge !== undefined && badge > 0 && (
          <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold text-white bg-red-500 rounded-full">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </div>
      <span className={cn(
        "text-[11px] font-medium leading-none",
        isActive && "font-semibold"
      )}>
        {label}
      </span>
    </button>
  );
}

export function AdminBottomNav({ activePage, onInboxClick, onSearchClick }: AdminBottomNavProps) {
  const [, setLocation] = useLocation();

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/leads/unread-count"],
    queryFn: async () => {
      const token = localStorage.getItem("admin_token");
      const response = await fetch("/api/leads/unread-count", {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) throw new Error("Failed to fetch unread count");
      return response.json();
    },
    refetchInterval: 30000,
  });

  const markAsReadMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem("admin_token");
      const response = await fetch("/api/leads/mark-read", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) throw new Error("Failed to mark as read");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads/unread-count"] });
    },
  });

  const handleDashboardClick = () => {
    setLocation("/admin");
  };

  const handleContractsClick = () => {
    setLocation("/contracts");
  };

  const handleInboxClick = () => {
    markAsReadMutation.mutate();
    onInboxClick?.();
  };

  const handleSearchClick = () => {
    onSearchClick?.();
  };

  const handleInfoClick = () => {
    setLocation("/admin/manual");
  };

  return (
    <footer className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t shadow-lg">
      <nav className="flex items-center h-16 max-w-lg mx-auto">
        <NavItem
          icon={<Megaphone className="w-5 h-5" />}
          label="Campanhas"
          isActive={activePage === "dashboard"}
          onClick={handleDashboardClick}
          testId="nav-campaigns"
        />
        <div className="h-8 w-px bg-border" />
        <NavItem
          icon={<FileText className="w-5 h-5" />}
          label="Contratos"
          isActive={activePage === "contracts"}
          onClick={handleContractsClick}
          testId="nav-contracts"
        />
        <div className="h-8 w-px bg-border" />
        <NavItem
          icon={<Inbox className="w-5 h-5" />}
          label="Inbox"
          isActive={false}
          onClick={handleInboxClick}
          badge={unreadData?.count}
          testId="nav-inbox"
        />
        <div className="h-8 w-px bg-border" />
        <NavItem
          icon={<Search className="w-5 h-5" />}
          label="Comercial"
          isActive={false}
          onClick={handleSearchClick}
          testId="nav-search"
        />
        <div className="h-8 w-px bg-border" />
        <NavItem
          icon={<Info className="w-5 h-5" />}
          label="Informações"
          isActive={false}
          onClick={handleInfoClick}
          testId="nav-info"
        />
      </nav>
    </footer>
  );
}
