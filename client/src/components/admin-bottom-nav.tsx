import { useLocation } from "wouter";
import { Inbox, FileText, Search, Megaphone, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

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
        "relative flex flex-col items-center justify-center gap-1 h-full min-h-[44px] flex-1 transition-colors",
        "hover-elevate active-elevate-2",
        isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
      )}
      data-testid={testId}
    >
      <div className="flex items-center justify-center">
        {icon}
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
  const { toast } = useToast();

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

  const handleInfoClick = async () => {
    try {
      toast({
        title: "Gerando manual...",
        description: "Aguarde enquanto o PDF é gerado.",
      });
      
      const token = localStorage.getItem("admin_token");
      const response = await fetch("/api/admin/platform-manual", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error("Erro ao gerar o manual");
      }
      
      const blob = await response.blob();
      
      // Criar URL e link para download
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.style.display = "none";
      link.href = downloadUrl;
      link.download = "Manual-Politicall.pdf";
      link.target = "_blank";
      
      // Adicionar ao DOM, clicar e remover
      document.body.appendChild(link);
      
      // Usar timeout para garantir que o navegador processe
      setTimeout(() => {
        link.click();
        setTimeout(() => {
          document.body.removeChild(link);
          window.URL.revokeObjectURL(downloadUrl);
        }, 100);
      }, 0);
      
      toast({
        title: "Download iniciado",
        description: "O manual está sendo baixado.",
      });
    } catch (error) {
      console.error("Erro ao baixar manual:", error);
      toast({
        title: "Erro",
        description: "Não foi possível gerar o manual. Tente novamente.",
        variant: "destructive",
      });
    }
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
          testId="nav-inbox"
        />
        <div className="h-8 w-px bg-border" />
        <NavItem
          icon={<Search className="w-5 h-5" />}
          label="Pesquisa"
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
