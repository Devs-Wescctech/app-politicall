import { useLocation } from "wouter";
import { Inbox, FileText, Search, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";

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
}

function NavItem({ icon, label, isActive, onClick, testId }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-center justify-center gap-1 h-full min-h-[44px] w-full transition-colors",
        "hover-elevate active-elevate-2",
        isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
      )}
      data-testid={testId}
    >
      <div className={cn(
        "flex items-center justify-center w-10 h-8 rounded-full transition-colors",
        isActive && "bg-primary/10"
      )}>
        {icon}
      </div>
      <span className={cn(
        "text-[11px] font-medium leading-none",
        isActive && "font-semibold"
      )}>
        {label}
      </span>
      {isActive && (
        <div className="absolute bottom-0 h-[3px] w-16 bg-primary rounded-t-full" />
      )}
    </button>
  );
}

export function AdminBottomNav({ activePage, onInboxClick, onSearchClick }: AdminBottomNavProps) {
  const [, setLocation] = useLocation();

  const handleDashboardClick = () => {
    setLocation("/admin");
  };

  const handleContractsClick = () => {
    setLocation("/contracts");
  };

  const handleInboxClick = () => {
    onInboxClick?.();
  };

  const handleSearchClick = () => {
    onSearchClick?.();
  };

  return (
    <footer className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t shadow-lg">
      <nav className="grid grid-cols-4 h-16 max-w-lg mx-auto">
        <NavItem
          icon={<Megaphone className="w-5 h-5" />}
          label="Campanhas"
          isActive={activePage === "dashboard"}
          onClick={handleDashboardClick}
          testId="nav-campaigns"
        />
        <NavItem
          icon={<FileText className="w-5 h-5" />}
          label="Contratos"
          isActive={activePage === "contracts"}
          onClick={handleContractsClick}
          testId="nav-contracts"
        />
        <NavItem
          icon={<Inbox className="w-5 h-5" />}
          label="Inbox"
          isActive={false}
          onClick={handleInboxClick}
          testId="nav-inbox"
        />
        <NavItem
          icon={<Search className="w-5 h-5" />}
          label="Pesquisa"
          isActive={false}
          onClick={handleSearchClick}
          testId="nav-search"
        />
      </nav>
    </footer>
  );
}
