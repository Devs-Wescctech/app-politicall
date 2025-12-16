import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle2, XCircle, ChevronLeft, ChevronRight, ChevronDown, User, Copy, Check, DollarSign, Inbox, Mail, Phone, Trash2, Search, Sun, Moon, Eye, Calendar, MapPin, Users, FileText, MessageSquare, BarChart3, X, RefreshCw, Server, Loader2, Info, AlertTriangle, Terminal, Database, FolderOpen, Key, HardDrive } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AdminBottomNav } from "@/components/admin-bottom-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import logoUrl from "@assets/logo pol_1763308638963.png";
import type { Lead } from "@shared/schema";

type SurveyCampaign = {
  id: string;
  userId: string;
  templateId: string;
  campaignName: string;
  slug: string;
  status: string;
  campaignStage: string;
  adminReviewerId: string | null;
  adminNotes: string | null;
  startDate: string | null;
  endDate: string | null;
  targetAudience: string | null;
  createdAt: string;
  updatedAt: string;
};

type SurveyTemplate = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  questionText: string;
  questionType: string;
  options: string[] | null;
  order: number;
  createdAt: string;
};

type CustomQuestion = {
  id: string;
  questionText: string;
  questionType: 'open_text' | 'single_choice' | 'multiple_choice';
  options?: string[];
  required: boolean;
};

type CampaignWithTemplate = SurveyCampaign & {
  template?: SurveyTemplate;
  user?: {
    id: string;
    name: string;
    email: string;
    avatar: string | null;
  };
  region?: string | null;
  customMainQuestion?: string | null;
  customMainQuestionType?: string | null;
  customMainQuestionOptions?: string[] | null;
  customQuestions?: CustomQuestion[] | null;
  viewCount?: number;
  budgetValue?: string | null;
};

export default function Admin() {
  const [, setLocation] = useLocation();
  const [isVerifying, setIsVerifying] = useState(true);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [paidDialogOpen, setPaidDialogOpen] = useState(false);
  const [deleteCampaignDialogOpen, setDeleteCampaignDialogOpen] = useState(false);
  const [inboxDialogOpen, setInboxDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignWithTemplate | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [leadToDelete, setLeadToDelete] = useState<string | null>(null);
  const [selectedPolitician, setSelectedPolitician] = useState<string>("all");
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return true;
  });
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [syncRequirementsOpen, setSyncRequirementsOpen] = useState(false);
  const [syncTargetUrl, setSyncTargetUrl] = useState("");
  const [syncApiKey, setSyncApiKey] = useState("");
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const [budgetValue, setBudgetValue] = useState("");
  const { toast } = useToast();

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    if (newMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  useEffect(() => {
    async function verifyAdminToken() {
      const token = localStorage.getItem("admin_token");
      
      if (!token) {
        setLocation("/admin-login");
        return;
      }

      try {
        const response = await fetch("/api/admin/verify", {
          headers: {
            "Authorization": `Bearer ${token}`,
          },
        });

        const result = await response.json();
        
        if (!result.valid) {
          localStorage.removeItem("admin_token");
          setLocation("/admin-login");
        } else {
          setIsVerifying(false);
        }
      } catch (error) {
        localStorage.removeItem("admin_token");
        setLocation("/admin-login");
      }
    }

    verifyAdminToken();
  }, [setLocation]);

  // Fetch campaigns
  const { data: campaigns, isLoading, error } = useQuery<CampaignWithTemplate[]>({
    queryKey: ["/api/admin/survey-campaigns"],
    queryFn: async () => {
      const token = localStorage.getItem("admin_token");
      
      const campaignsResponse = await fetch("/api/admin/survey-campaigns", {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      
      if (!campaignsResponse.ok) {
        throw new Error("Erro ao carregar campanhas");
      }
      
      const campaignsData: SurveyCampaign[] = await campaignsResponse.json();
      
      // Fetch templates for each campaign (public endpoint, no auth needed)
      const templatesResponse = await fetch("/api/survey-templates");
      const templates: SurveyTemplate[] = await templatesResponse.json();
      
      // Combine campaigns with their templates
      return campaignsData.map(campaign => ({
        ...campaign,
        template: templates.find(t => t.id === campaign.templateId)
      }));
    },
    enabled: !isVerifying,
  });

  // Fetch budget ADS setting
  const { data: budgetSetting } = useQuery<{ key: string; value: string | null }>({
    queryKey: ["/api/admin/settings/budget_ads"],
    queryFn: async () => {
      const token = localStorage.getItem("admin_token");
      const response = await fetch("/api/admin/settings/budget_ads", {
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        throw new Error("Erro ao buscar configuração");
      }
      return response.json();
    },
    enabled: !isVerifying,
  });

  // Update budget ADS mutation
  const updateBudgetMutation = useMutation({
    mutationFn: async (value: string) => {
      const token = localStorage.getItem("admin_token");
      const response = await fetch("/api/admin/settings/budget_ads", {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          value, 
          description: "Valor cobrado por pesquisa com ADS" 
        }),
      });
      if (!response.ok) {
        throw new Error("Erro ao salvar configuração");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/budget_ads"] });
      toast({
        title: "Configuração salva",
        description: "O valor do Budget ADS foi atualizado com sucesso.",
      });
      setBudgetDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Fetch leads from inbox
  const { data: leads = [], isLoading: leadsLoading, error: leadsError } = useQuery<Lead[]>({
    queryKey: ["/api/leads"],
    queryFn: async () => {
      const token = localStorage.getItem("admin_token");
      const response = await fetch("/api/leads", {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      
      if (!response.ok) {
        throw new Error("Erro ao carregar leads");
      }
      
      return response.json();
    },
    enabled: !isVerifying,
  });

  // Delete single lead mutation
  const deleteLeadMutation = useMutation({
    mutationFn: async (leadId: string) => {
      const token = localStorage.getItem("admin_token");
      const response = await fetch(`/api/leads/${leadId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error("Erro ao excluir cadastro");
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({
        title: "Cadastro excluído",
        description: "O cadastro foi excluído com sucesso.",
      });
      setDeleteConfirmOpen(false);
      setLeadToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete multiple leads mutation
  const deleteMultipleLeadsMutation = useMutation({
    mutationFn: async (leadIds: string[]) => {
      const token = localStorage.getItem("admin_token");
      const response = await fetch("/api/leads/delete-multiple", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids: leadIds }),
      });
      
      if (!response.ok) {
        throw new Error("Erro ao excluir cadastros");
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({
        title: "Cadastros excluídos",
        description: `${selectedLeads.size} cadastro(s) excluído(s) com sucesso.`,
      });
      setSelectedLeads(new Set());
      setDeleteConfirmOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handle select all/deselect all
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedLeads(new Set(leads.map(lead => lead.id)));
    } else {
      setSelectedLeads(new Set());
    }
  };

  // Handle individual lead selection
  const handleLeadSelection = (leadId: string, checked: boolean) => {
    const newSelection = new Set(selectedLeads);
    if (checked) {
      newSelection.add(leadId);
    } else {
      newSelection.delete(leadId);
    }
    setSelectedLeads(newSelection);
  };

  // Handle delete confirmation
  const handleDeleteConfirm = () => {
    if (leadToDelete) {
      deleteLeadMutation.mutate(leadToDelete);
    } else if (selectedLeads.size > 0) {
      deleteMultipleLeadsMutation.mutate(Array.from(selectedLeads));
    }
  };

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const token = localStorage.getItem("admin_token");
      const response = await fetch(`/api/admin/survey-campaigns/${campaignId}/approve`, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      
      if (!response.ok) {
        throw new Error("Erro ao aprovar campanha");
      }
      
      return response.json();
    },
    onMutate: async (campaignId: string) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["/api/admin/survey-campaigns"] });
      
      // Snapshot the previous value
      const previousCampaigns = queryClient.getQueryData<CampaignWithTemplate[]>(["/api/admin/survey-campaigns"]);
      
      // Optimistically update to the new value
      queryClient.setQueryData<CampaignWithTemplate[]>(["/api/admin/survey-campaigns"], (old) => {
        if (!old) return old;
        return old.map(campaign => 
          campaign.id === campaignId 
            ? { ...campaign, status: "approved", campaignStage: "aprovado" } 
            : campaign
        );
      });
      
      // Return a context object with the snapshotted value
      return { previousCampaigns };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/survey-campaigns"] });
      toast({
        title: "Campanha aprovada",
        description: "A campanha foi aprovada com sucesso.",
      });
    },
    onError: (error: Error, campaignId, context) => {
      // Rollback to the previous value on error
      if (context?.previousCampaigns) {
        queryClient.setQueryData(["/api/admin/survey-campaigns"], context.previousCampaigns);
      }
      toast({
        title: "Erro ao aprovar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ campaignId, adminNotes }: { campaignId: string; adminNotes: string }) => {
      const token = localStorage.getItem("admin_token");
      const response = await fetch(`/api/admin/survey-campaigns/${campaignId}/reject`, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ adminNotes }),
      });
      
      if (!response.ok) {
        throw new Error("Erro ao rejeitar campanha");
      }
      
      return response.json();
    },
    onMutate: async ({ campaignId, adminNotes }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["/api/admin/survey-campaigns"] });
      
      // Snapshot the previous value
      const previousCampaigns = queryClient.getQueryData<CampaignWithTemplate[]>(["/api/admin/survey-campaigns"]);
      
      // Optimistically update to the new value
      queryClient.setQueryData<CampaignWithTemplate[]>(["/api/admin/survey-campaigns"], (old) => {
        if (!old) return old;
        return old.map(campaign => 
          campaign.id === campaignId 
            ? { ...campaign, status: "rejected", adminNotes } 
            : campaign
        );
      });
      
      // Return a context object with the snapshotted value
      return { previousCampaigns };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/survey-campaigns"] });
      setRejectDialogOpen(false);
      setRejectNotes("");
      setSelectedCampaign(null);
      toast({
        title: "Campanha rejeitada",
        description: "A campanha foi rejeitada com sucesso.",
      });
    },
    onError: (error: Error, variables, context) => {
      // Rollback to the previous value on error
      if (context?.previousCampaigns) {
        queryClient.setQueryData(["/api/admin/survey-campaigns"], context.previousCampaigns);
      }
      toast({
        title: "Erro ao rejeitar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update stage mutation
  const updateStageMutation = useMutation({
    mutationFn: async ({ campaignId, campaignStage }: { campaignId: string; campaignStage: string }) => {
      const token = localStorage.getItem("admin_token");
      const response = await fetch(`/api/admin/survey-campaigns/${campaignId}/stage`, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ campaignStage }),
      });
      
      if (!response.ok) {
        throw new Error("Erro ao atualizar estágio da campanha");
      }
      
      return response.json();
    },
    onMutate: async ({ campaignId, campaignStage }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["/api/admin/survey-campaigns"] });
      
      // Snapshot the previous value
      const previousCampaigns = queryClient.getQueryData<CampaignWithTemplate[]>(["/api/admin/survey-campaigns"]);
      
      // Optimistically update to the new value
      queryClient.setQueryData<CampaignWithTemplate[]>(["/api/admin/survey-campaigns"], (old) => {
        if (!old) return old;
        return old.map(campaign => 
          campaign.id === campaignId 
            ? { ...campaign, campaignStage } 
            : campaign
        );
      });
      
      // Return a context object with the snapshotted value
      return { previousCampaigns };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/survey-campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/survey-campaigns"] });
      toast({
        title: "Estágio atualizado",
        description: "O estágio da campanha foi atualizado com sucesso.",
      });
    },
    onError: (error: Error, variables, context) => {
      // Rollback to the previous value on error
      if (context?.previousCampaigns) {
        queryClient.setQueryData(["/api/admin/survey-campaigns"], context.previousCampaigns);
      }
      toast({
        title: "Erro ao atualizar estágio",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete paid campaign mutation
  const deletePaidMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const token = localStorage.getItem("admin_token");
      const response = await fetch(`/api/admin/survey-campaigns/${campaignId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error("Erro ao remover campanha");
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/survey-campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/survey-campaigns"] });
      setPaidDialogOpen(false);
      setSelectedCampaign(null);
      toast({
        title: "Campanha removida",
        description: "A campanha foi marcada como paga e removida do sistema.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao remover campanha",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteCampaignMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const token = localStorage.getItem("admin_token");
      const response = await fetch(`/api/admin/survey-campaigns/${campaignId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error("Erro ao excluir campanha");
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/survey-campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/survey-campaigns"] });
      setDeleteCampaignDialogOpen(false);
      setSelectedCampaign(null);
      toast({
        title: "Campanha excluída",
        description: "A campanha foi excluída permanentemente do sistema.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir campanha",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // System sync mutation - PULL data from source server (Replit)
  const systemSyncMutation = useMutation({
    mutationFn: async ({ sourceUrl, apiKey }: { sourceUrl: string; apiKey: string }) => {
      const token = localStorage.getItem("admin_token");
      const response = await fetch("/api/admin/system-sync/pull", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sourceUrl, apiKey }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Erro ao sincronizar sistema");
      }
      
      return data;
    },
    onSuccess: (data) => {
      setSyncDialogOpen(false);
      toast({
        title: "Sincronização concluída",
        description: data.message || "Os dados foram importados com sucesso do servidor fonte.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro na sincronização",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleLogout = () => {
    localStorage.removeItem("admin_token");
    setLocation("/login");
  };

  const handleCopyLink = async (campaign: CampaignWithTemplate) => {
    const surveyUrl = `${window.location.origin}/pesquisa/${campaign.slug}`;
    try {
      await navigator.clipboard.writeText(surveyUrl);
      setCopiedId(campaign.id);
      toast({
        title: "Link copiado!",
        description: "O link da pesquisa foi copiado para a área de transferência.",
      });
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      toast({
        title: "Erro ao copiar",
        description: "Não foi possível copiar o link.",
        variant: "destructive",
      });
    }
  };

  const handleApprove = (campaign: CampaignWithTemplate) => {
    approveMutation.mutate(campaign.id);
  };

  const handleRejectClick = (campaign: CampaignWithTemplate) => {
    setSelectedCampaign(campaign);
    setRejectDialogOpen(true);
  };

  const handleRejectConfirm = () => {
    if (selectedCampaign) {
      rejectMutation.mutate({
        campaignId: selectedCampaign.id,
        adminNotes: rejectNotes || "Rejeitado pelo administrador",
      });
    }
  };

  const handleMoveStage = (campaignId: string, newStage: string) => {
    updateStageMutation.mutate({ campaignId, campaignStage: newStage });
  };

  const handlePaidClick = (campaign: CampaignWithTemplate) => {
    setSelectedCampaign(campaign);
    setPaidDialogOpen(true);
  };

  const handlePaidConfirm = () => {
    if (selectedCampaign) {
      deletePaidMutation.mutate(selectedCampaign.id);
    }
  };

  const handleDeleteCampaignClick = (campaign: CampaignWithTemplate) => {
    setSelectedCampaign(campaign);
    setDeleteCampaignDialogOpen(true);
  };

  const handleDeleteCampaignConfirm = () => {
    if (selectedCampaign) {
      deleteCampaignMutation.mutate(selectedCampaign.id);
    }
  };

  if (isVerifying) {
    return null;
  }

  // Filter campaigns by stage and status
  const allCampaigns = campaigns || [];
  
  // Only show paid campaigns (google_ads) in admin kanban
  const paidCampaigns = allCampaigns.filter(c => c.distributionType === "google_ads");
  
  // Get unique politicians for filter (from paid campaigns only)
  const uniquePoliticians = paidCampaigns
    .filter(c => c.user)
    .reduce((acc, c) => {
      if (c.user && !acc.find(p => p.id === c.user!.id)) {
        acc.push({ id: c.user.id, name: c.user.name });
      }
      return acc;
    }, [] as { id: string; name: string }[])
    .sort((a, b) => a.name.localeCompare(b.name));

  // Apply politician filter
  const filteredCampaigns = selectedPolitician === "all" 
    ? paidCampaigns 
    : paidCampaigns.filter(c => c.user?.id === selectedPolitician);
  
  // Filter by campaign stage for kanban
  const aguardandoCampaigns = filteredCampaigns.filter(c => c.campaignStage === "aguardando");
  const aprovadoCampaigns = filteredCampaigns.filter(c => c.campaignStage === "aprovado");
  const emProducaoCampaigns = filteredCampaigns.filter(c => c.campaignStage === "em_producao");
  const finalizadoCampaigns = filteredCampaigns.filter(c => c.campaignStage === "finalizado");
  
  // Filter by status for tabs (also apply politician filter)
  const pendingCampaigns = filteredCampaigns.filter(c => c.status === "under_review");
  const approvedCampaigns = filteredCampaigns.filter(c => c.status === "approved");
  const rejectedCampaigns = filteredCampaigns.filter(c => c.status === "rejected");

  const getStageBadge = (campaignStage: string) => {
    switch (campaignStage) {
      case "aguardando":
        return <span className="text-xs font-medium text-muted-foreground">Aguardando</span>;
      case "aprovado":
        return <Badge className="bg-[#40E0D0] text-white">Aprovado</Badge>;
      case "em_producao":
        return <Badge className="bg-blue-500 text-white">Em Produção</Badge>;
      case "finalizado":
        return <Badge className="bg-green-500 text-white">Finalizado</Badge>;
      default:
        return <Badge variant="secondary">{campaignStage}</Badge>;
    }
  };

  const renderCampaignCard = (campaign: CampaignWithTemplate) => {
    const stageMap = {
      "aguardando": { prev: null, next: null }, // No advance button in Aguardando - approval moves automatically
      "aprovado": { prev: "aguardando", next: "em_producao" },
      "em_producao": { prev: "aprovado", next: "finalizado" },
      "finalizado": { prev: "em_producao", next: null }
    };

    const currentStageInfo = stageMap[campaign.campaignStage as keyof typeof stageMap];

    const handleCardClick = (e: React.MouseEvent) => {
      // Don't open modal if clicking on buttons
      const target = e.target as HTMLElement;
      if (target.closest('button')) return;
      
      setSelectedCampaign(campaign);
      setDetailsDialogOpen(true);
    };

    return (
      <Card 
        key={campaign.id} 
        className="hover-elevate overflow-hidden cursor-pointer" 
        data-testid={`card-campaign-${campaign.id}`}
        onClick={handleCardClick}
      >
        <CardHeader 
          className="p-4 pb-3 bg-gradient-to-r from-[#40E0D0]/10 to-[#48D1CC]/5 relative"
          style={{
            borderBottom: '2px dashed hsl(var(--border))',
          }}
        >
          {/* Círculos decorativos nas laterais estilo cupom */}
          <div className="absolute -left-3 bottom-0 w-6 h-6 rounded-full bg-background border-2 border-border" />
          <div className="absolute -right-3 bottom-0 w-6 h-6 rounded-full bg-background border-2 border-border" />
          
          <div className="flex items-start gap-3">
            {campaign.user && (
              <Avatar className="w-10 h-10 flex-shrink-0 border-2 border-[#40E0D0]/30" data-testid={`avatar-user-${campaign.id}`}>
                <AvatarImage src={campaign.user.avatar || undefined} alt={campaign.user.name} />
                <AvatarFallback className="bg-[#40E0D0]/10">
                  <User className="w-5 h-5 text-[#40E0D0]" />
                </AvatarFallback>
              </Avatar>
            )}
            <div className="flex-1 min-w-0">
              <CardTitle className="text-xs font-semibold" data-testid={`text-campaign-name-${campaign.id}`}>
                {campaign.campaignName}
              </CardTitle>
              {campaign.user && (
                <p className="text-xs text-muted-foreground mt-1" data-testid={`text-user-name-${campaign.id}`}>
                  {campaign.user.name}
                </p>
              )}
            </div>
            <Eye className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          </div>
        </CardHeader>
        <CardContent className="space-y-2 p-4">
          <div className="space-y-1.5">
            <div className="flex items-start justify-between gap-2" data-testid={`text-created-${campaign.id}`}>
              <div className="flex-1">
                <p className="text-xs font-medium text-muted-foreground">Data de criação</p>
                <p className="text-xs">
                  {format(new Date(campaign.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                </p>
              </div>
              {campaign.status === "approved" && (
                <div className="flex gap-1 flex-shrink-0">
                  <Button
                    onClick={() => handleCopyLink(campaign)}
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    data-testid={`button-copy-link-${campaign.id}`}
                  >
                    {copiedId === campaign.id ? (
                      <Check className="w-4 h-4 text-[#40E0D0]" />
                    ) : (
                      <Copy className="w-4 h-4 text-muted-foreground hover:text-[#40E0D0]" />
                    )}
                  </Button>
                  {campaign.campaignStage === "aguardando" && (
                    <Button
                      onClick={() => handleDeleteCampaignClick(campaign)}
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      data-testid={`button-delete-campaign-${campaign.id}`}
                    >
                      <Trash2 className="w-4 h-4 text-destructive hover:text-destructive/80" />
                    </Button>
                  )}
                </div>
              )}
              {campaign.status === "rejected" && (
                <Button
                  onClick={() => handleDeleteCampaignClick(campaign)}
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0 flex-shrink-0"
                  data-testid={`button-delete-rejected-${campaign.id}`}
                >
                  <Trash2 className="w-4 h-4 text-destructive hover:text-destructive/80" />
                </Button>
              )}
            </div>

            {campaign.targetAudience && (
              <div data-testid={`text-audience-${campaign.id}`}>
                <p className="text-xs font-medium text-muted-foreground">Público-alvo</p>
                <p className="text-xs">{campaign.targetAudience}</p>
              </div>
            )}

            {campaign.adminNotes && (
              <div data-testid={`text-admin-notes-${campaign.id}`}>
                <p className="text-xs font-medium text-muted-foreground">Notas do Admin</p>
                <p className="text-xs">{campaign.adminNotes}</p>
              </div>
            )}
          </div>

          {campaign.status === "under_review" && (
            <div className="space-y-1.5 pt-1">
              <Button
                onClick={() => handleApprove(campaign)}
                disabled={approveMutation.isPending}
                size="sm"
                variant="outline"
                className="w-full border-[#40E0D0] text-foreground hover:bg-[#40E0D0]/10"
                data-testid={`button-approve-${campaign.id}`}
              >
                <CheckCircle2 className="w-3 h-3 mr-1 text-[#40E0D0]" />
                Aprovar
              </Button>
              <Button
                onClick={() => handleRejectClick(campaign)}
                disabled={rejectMutation.isPending}
                size="sm"
                variant="outline"
                className="w-full border-destructive text-foreground hover:bg-destructive/10"
                data-testid={`button-reject-${campaign.id}`}
              >
                <XCircle className="w-3 h-3 mr-1 text-destructive" />
                Rejeitar
              </Button>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            {campaign.campaignStage === "finalizado" ? (
              <Button
                onClick={() => handlePaidClick(campaign)}
                disabled={deletePaidMutation.isPending}
                size="sm"
                variant="outline"
                className="w-full border-green-500 text-foreground hover:bg-green-500/10"
                data-testid={`button-paid-${campaign.id}`}
              >
                <DollarSign className="w-3 h-3 mr-1 text-green-500" />
                Pago
              </Button>
            ) : (
              <>
                {currentStageInfo.next && (
                  <Button
                    onClick={() => handleMoveStage(campaign.id, currentStageInfo.next!)}
                    disabled={updateStageMutation.isPending}
                    size="sm"
                    variant="outline"
                    className="w-full"
                    data-testid={`button-stage-next-${campaign.id}`}
                  >
                    Avançar
                    <ChevronRight className="w-3 h-3 ml-1" />
                  </Button>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Fixed Header */}
      <header className="sticky top-0 z-50 bg-card border-b shrink-0">
        <div className="flex items-center justify-between px-6 py-4">
          <img src={logoUrl} alt="Politicall Logo" className="h-10" data-testid="img-logo" />
          <div className="flex items-center gap-3">
            <Button 
              size="icon"
              variant="ghost"
              onClick={toggleDarkMode}
              className="rounded-full"
              data-testid="button-toggle-dark-mode"
            >
              {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </Button>
            <Button 
              variant="outline"
              onClick={() => setSyncDialogOpen(true)}
              className="rounded-full gap-2"
              data-testid="button-sync-system"
            >
              <Server className="w-4 h-4" />
              Atualizar Sistema
            </Button>
            <Button 
              onClick={handleLogout} 
              variant="outline"
              className="rounded-full w-32"
              data-testid="button-logout"
            >
              Sair
            </Button>
          </div>
        </div>
      </header>
      {/* Main Content - Kanban Board */}
      <main className="flex-1 container mx-auto p-6 pb-24">
        <div className="mb-6 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold mb-2" data-testid="text-kanban-title">Kanban de Estágios</h2>
              <p className="text-sm text-muted-foreground" data-testid="text-kanban-subtitle">
                Gerencie as campanhas de pesquisa através dos diferentes estágios
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground mb-1">Caixa Total</p>
              <p className="text-2xl font-bold text-[#40E0D0]" data-testid="text-total-revenue">
                R$ {approvedCampaigns.reduce((total, campaign) => {
                  const value = campaign.budgetValue ? parseFloat(campaign.budgetValue) : 1250;
                  return total + value;
                }, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
          
          {/* Filtro por Político */}
          <div className="flex items-center gap-3 flex-wrap">
            <Users className="w-4 h-4 text-muted-foreground" />
            <Select value={selectedPolitician} onValueChange={setSelectedPolitician}>
              <SelectTrigger className="w-64 rounded-full" data-testid="select-politician-filter">
                <SelectValue placeholder="Filtrar por político" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os políticos</SelectItem>
                {uniquePoliticians.map((politician) => (
                  <SelectItem key={politician.id} value={politician.id}>
                    {politician.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedPolitician !== "all" && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setSelectedPolitician("all")}
                data-testid="button-clear-filter"
              >
                <X className="w-4 h-4 mr-1" />
                Limpar filtro
              </Button>
            )}
            <Button 
              variant="outline" 
              size="sm"
              className="rounded-full ml-auto"
              onClick={() => {
                setBudgetValue(budgetSetting?.value || "1250");
                setBudgetDialogOpen(true);
              }}
              data-testid="button-budget-ads"
            >
              <DollarSign className="w-4 h-4 mr-1" />
              Budget ADS
              {budgetSetting?.value && (
                <Badge variant="secondary" className="ml-2">
                  R$ {parseFloat(budgetSetting.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </Badge>
              )}
            </Button>
          </div>
        </div>

        {isLoading && (
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-4">
                <Card>
                  <CardHeader>
                    <Skeleton className="h-6 w-3/4" />
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader>
                    <Skeleton className="h-6 w-3/4" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3 mt-2" />
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        )}

        {error && (
          <Card className="p-6" data-testid="card-error">
            <p className="text-center text-destructive" data-testid="text-error">
              Erro ao carregar campanhas: {error.message}
            </p>
          </Card>
        )}

        {!isLoading && !error && (
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4" data-testid="kanban-board">
            {/* Coluna Aguardando */}
            <div className="space-y-4" data-testid="kanban-column-aguardando">
              <Card className="bg-muted/50">
                <CardHeader className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base font-semibold">Aguardando</CardTitle>
                    <Badge variant="secondary" data-testid="badge-count-aguardando">
                      {aguardandoCampaigns.length}
                    </Badge>
                  </div>
                </CardHeader>
              </Card>
              <div className="space-y-3">
                {aguardandoCampaigns.length === 0 ? (
                  <Card className="p-4" data-testid="empty-aguardando">
                    <p className="text-sm text-center text-muted-foreground">
                      Nenhuma campanha aguardando
                    </p>
                  </Card>
                ) : (
                  aguardandoCampaigns.map(renderCampaignCard)
                )}
              </div>
            </div>

            {/* Coluna Aprovado */}
            <div className="space-y-4" data-testid="kanban-column-aprovado">
              <Card className="bg-[#40E0D0]/10">
                <CardHeader className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base font-semibold">Aprovado</CardTitle>
                    <Badge className="bg-[#40E0D0] text-white" data-testid="badge-count-aprovado">
                      {aprovadoCampaigns.length}
                    </Badge>
                  </div>
                </CardHeader>
              </Card>
              <div className="space-y-3">
                {aprovadoCampaigns.length === 0 ? (
                  <Card className="p-4" data-testid="empty-aprovado">
                    <p className="text-sm text-center text-muted-foreground">
                      Nenhuma campanha aprovada
                    </p>
                  </Card>
                ) : (
                  aprovadoCampaigns.map(renderCampaignCard)
                )}
              </div>
            </div>

            {/* Coluna Em Produção */}
            <div className="space-y-4" data-testid="kanban-column-em-producao">
              <Card className="bg-blue-50 dark:bg-blue-950/20">
                <CardHeader className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base font-semibold">Em Produção</CardTitle>
                    <Badge variant="secondary" data-testid="badge-count-em-producao">
                      {emProducaoCampaigns.length}
                    </Badge>
                  </div>
                </CardHeader>
              </Card>
              <div className="space-y-3">
                {emProducaoCampaigns.length === 0 ? (
                  <Card className="p-4" data-testid="empty-em-producao">
                    <p className="text-sm text-center text-muted-foreground">
                      Nenhuma campanha em produção
                    </p>
                  </Card>
                ) : (
                  emProducaoCampaigns.map(renderCampaignCard)
                )}
              </div>
            </div>

            {/* Coluna Finalizado */}
            <div className="space-y-4" data-testid="kanban-column-finalizado">
              <Card className="bg-green-50 dark:bg-green-950/20">
                <CardHeader className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base font-semibold">Finalizado</CardTitle>
                    <Badge variant="secondary" data-testid="badge-count-finalizado">
                      {finalizadoCampaigns.length}
                    </Badge>
                  </div>
                </CardHeader>
              </Card>
              <div className="space-y-3">
                {finalizadoCampaigns.length === 0 ? (
                  <Card className="p-4" data-testid="empty-finalizado">
                    <p className="text-sm text-center text-muted-foreground">
                      Nenhuma campanha finalizada
                    </p>
                  </Card>
                ) : (
                  finalizadoCampaigns.map(renderCampaignCard)
                )}
              </div>
            </div>
          </div>
        )}
      </main>
      {/* Bottom Navigation */}
      <AdminBottomNav 
        activePage="dashboard" 
        onInboxClick={() => setInboxDialogOpen(true)}
        onSearchClick={() => {
          const searchInput = document.querySelector('[data-testid="input-search"]') as HTMLInputElement;
          if (searchInput) {
            searchInput.focus();
            searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }}
      />
      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent data-testid="dialog-reject">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-title">Rejeitar Campanha</DialogTitle>
            <DialogDescription data-testid="text-dialog-description">
              {selectedCampaign && (
                <>
                  Você está rejeitando a campanha: <strong>{selectedCampaign.campaignName}</strong>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="reject-notes" className="text-sm font-medium">
                Motivo da rejeição
              </label>
              <Textarea
                id="reject-notes"
                placeholder="Digite o motivo da rejeição..."
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
                className="min-h-32"
                data-testid="input-reject-notes"
              />
            </div>
          </div>

          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setRejectDialogOpen(false);
                setRejectNotes("");
                setSelectedCampaign(null);
              }}
              className="flex-1"
              data-testid="button-cancel-reject"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleRejectConfirm}
              disabled={rejectMutation.isPending}
              variant="destructive"
              className="flex-1"
              data-testid="button-confirm-reject"
            >
              Confirmar Rejeição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Paid Dialog */}
      <Dialog open={paidDialogOpen} onOpenChange={setPaidDialogOpen}>
        <DialogContent data-testid="dialog-paid">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-paid-title">Confirmar Pagamento</DialogTitle>
            <DialogDescription data-testid="text-dialog-paid-description">
              {selectedCampaign && (
                <>
                  Você está marcando a campanha como paga: <strong>{selectedCampaign.campaignName}</strong>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Ao confirmar, esta campanha será marcada como paga e removida do sistema. 
              Esta ação não pode ser desfeita.
            </p>
            <div className="bg-green-50 dark:bg-green-950/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
              <p className="text-sm font-medium text-green-700 dark:text-green-300">
                Valor da campanha: R$ 1.250,00
              </p>
            </div>
          </div>

          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setPaidDialogOpen(false);
                setSelectedCampaign(null);
              }}
              className="flex-1"
              data-testid="button-cancel-paid"
            >
              Cancelar
            </Button>
            <Button
              onClick={handlePaidConfirm}
              disabled={deletePaidMutation.isPending}
              className="flex-1 bg-green-500 hover:bg-green-600 text-white"
              data-testid="button-confirm-paid"
            >
              <DollarSign className="w-4 h-4 mr-2" />
              Confirmar Pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Delete Campaign Dialog */}
      <Dialog open={deleteCampaignDialogOpen} onOpenChange={setDeleteCampaignDialogOpen}>
        <DialogContent data-testid="dialog-delete-campaign">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-delete-campaign-title">Excluir Campanha</DialogTitle>
            <DialogDescription data-testid="text-dialog-delete-campaign-description">
              {selectedCampaign && (
                <>
                  Você está excluindo permanentemente a campanha: <strong>{selectedCampaign.campaignName}</strong>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Ao confirmar, esta campanha será excluída permanentemente do sistema. 
              Esta ação não pode ser desfeita.
            </p>
          </div>

          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setDeleteCampaignDialogOpen(false);
                setSelectedCampaign(null);
              }}
              className="flex-1"
              data-testid="button-cancel-delete-campaign"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleDeleteCampaignConfirm}
              disabled={deleteCampaignMutation.isPending}
              variant="destructive"
              className="flex-1"
              data-testid="button-confirm-delete-campaign"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Confirmar Exclusão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Inbox Dialog - Leads from Landing Page */}
      <Dialog open={inboxDialogOpen} onOpenChange={setInboxDialogOpen}>
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 [&>button]:hidden" data-testid="dialog-inbox">
          {/* Fixed Header */}
          <div className="flex-shrink-0 px-6 pt-6 pb-4 border-b">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <DialogTitle data-testid="text-dialog-inbox-title">
                  Caixa de Entrada
                </DialogTitle>
                <DialogDescription data-testid="text-dialog-inbox-description">
                  Cadastros realizados através do formulário da landing page
                </DialogDescription>
              </div>
              {leads.length > 0 && (
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="select-all-leads"
                      checked={selectedLeads.size === leads.length && leads.length > 0}
                      onCheckedChange={(checked) => handleSelectAll(checked as boolean)}
                      data-testid="checkbox-select-all-leads"
                    />
                    <label 
                      htmlFor="select-all-leads" 
                      className="text-sm font-medium cursor-pointer"
                    >
                      Selecionar todos
                    </label>
                  </div>
                  {selectedLeads.size > 0 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setLeadToDelete(null);
                        setDeleteConfirmOpen(true);
                      }}
                      disabled={deleteMultipleLeadsMutation.isPending}
                      title={`Excluir ${selectedLeads.size} selecionado(s)`}
                      data-testid="button-delete-selected-header"
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {leadsLoading && (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="p-4 border rounded-lg">
                    <Skeleton className="h-5 w-3/4 mb-2" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                ))}
              </div>
            )}

            {leadsError && (
              <div className="text-center py-12">
                <p className="text-destructive font-medium mb-2">
                  Erro ao carregar cadastros
                </p>
                <p className="text-sm text-muted-foreground">
                  {(leadsError as Error).message}
                </p>
              </div>
            )}

            {!leadsLoading && !leadsError && leads.length === 0 && (
              <div className="text-center py-12">
                <Inbox className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">
                  Nenhum cadastro encontrado
                </p>
              </div>
            )}

            {!leadsLoading && leads.length > 0 && (
              <div className="space-y-3">
                {leads.map((lead) => (
                  <Card key={lead.id} className="hover-elevate" data-testid={`lead-card-${lead.id}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={selectedLeads.has(lead.id)}
                          onCheckedChange={(checked) => handleLeadSelection(lead.id, checked as boolean)}
                          data-testid={`checkbox-lead-${lead.id}`}
                          className="mt-1"
                        />
                        <div className="flex items-start justify-between gap-4 flex-1">
                          <div className="flex-1">
                            <CardTitle className="text-base font-semibold mb-1" data-testid={`lead-name-${lead.id}`}>
                              {lead.name}
                            </CardTitle>
                            <p className="text-sm text-muted-foreground">
                              {lead.position} • {lead.city}/{lead.state}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-xs text-muted-foreground">
                              {new Date(lead.createdAt).toLocaleDateString('pt-BR')}
                            </div>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                setLeadToDelete(lead.id);
                                setDeleteConfirmOpen(true);
                              }}
                              data-testid={`button-delete-lead-${lead.id}`}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex items-center gap-4 text-sm">
                        {lead.email && (
                          <div className="flex items-center gap-2">
                            <Mail className="w-4 h-4 text-muted-foreground" />
                            <a 
                              href={`mailto:${lead.email}`}
                              className="text-primary hover:underline"
                              data-testid={`lead-email-${lead.id}`}
                            >
                              {lead.email}
                            </a>
                          </div>
                        )}
                        {lead.phone && (
                          <div className="flex items-center gap-2">
                            <Phone className="w-4 h-4 text-muted-foreground" />
                            <a 
                              href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline"
                              data-testid={`lead-phone-${lead.id}`}
                            >
                              {lead.phone}
                            </a>
                          </div>
                        )}
                      </div>
                      {lead.message && (
                        <Collapsible>
                          <CollapsibleTrigger className="w-full mt-3 p-3 bg-muted rounded-lg flex items-center justify-between hover-elevate cursor-pointer">
                            <span className="text-sm text-muted-foreground font-medium flex items-center gap-2">
                              <MessageSquare className="w-4 h-4" />
                              Mensagem
                            </span>
                            <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform duration-200 [[data-state=open]_&]:rotate-180" />
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-2 px-3 pb-3">
                            <p className="text-sm" data-testid={`lead-message-${lead.id}`}>
                              {lead.message}
                            </p>
                          </CollapsibleContent>
                        </Collapsible>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Fixed Footer */}
          <div className="flex-shrink-0 px-6 py-4 border-t flex items-center justify-between">
            <div className="flex items-center gap-2">
              {selectedLeads.size > 0 && (
                <Button
                  variant="destructive"
                  onClick={() => {
                    setLeadToDelete(null);
                    setDeleteConfirmOpen(true);
                  }}
                  disabled={deleteMultipleLeadsMutation.isPending}
                  data-testid="button-delete-selected-leads"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Excluir selecionados ({selectedLeads.size})
                </Button>
              )}
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setInboxDialogOpen(false);
                setSelectedLeads(new Set());
              }}
              data-testid="button-close-inbox"
            >
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent data-testid="dialog-delete-confirm">
          <DialogHeader>
            <DialogTitle>
              {leadToDelete ? "Excluir cadastro" : `Excluir ${selectedLeads.size} cadastro(s)`}
            </DialogTitle>
            <DialogDescription>
              {leadToDelete 
                ? "Tem certeza que deseja excluir este cadastro? Esta ação não pode ser desfeita."
                : `Tem certeza que deseja excluir ${selectedLeads.size} cadastro(s) selecionado(s)? Esta ação não pode ser desfeita.`
              }
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteConfirmOpen(false);
                setLeadToDelete(null);
              }}
              disabled={deleteLeadMutation.isPending || deleteMultipleLeadsMutation.isPending}
              data-testid="button-cancel-delete"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleteLeadMutation.isPending || deleteMultipleLeadsMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {(deleteLeadMutation.isPending || deleteMultipleLeadsMutation.isPending) ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Survey Details Dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-2xl h-[85vh] flex flex-col p-0 [&>button]:hidden" data-testid="dialog-survey-details">
          {/* Fixed Header */}
          <div className="flex-shrink-0 p-6 pb-4 border-b bg-gradient-to-r from-[#40E0D0]/10 to-[#48D1CC]/5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                {selectedCampaign?.user && (
                  <Avatar className="w-12 h-12 flex-shrink-0 border-2 border-[#40E0D0]/30">
                    <AvatarImage src={selectedCampaign.user.avatar || undefined} alt={selectedCampaign.user.name} />
                    <AvatarFallback className="bg-[#40E0D0]/10">
                      <User className="w-6 h-6 text-[#40E0D0]" />
                    </AvatarFallback>
                  </Avatar>
                )}
                <div>
                  <DialogTitle className="text-lg font-semibold" data-testid="text-details-title">
                    {selectedCampaign?.campaignName}
                  </DialogTitle>
                  <DialogDescription className="mt-1" data-testid="text-details-user">
                    {selectedCampaign?.user?.name} • {selectedCampaign?.user?.email}
                  </DialogDescription>
                </div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setDetailsDialogOpen(false)}
                className="flex-shrink-0"
                data-testid="button-close-details"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
            
            <div className="flex flex-wrap gap-3 mt-4 text-sm font-medium">
              {selectedCampaign?.status && (
                <span 
                  className={
                    selectedCampaign.status === "approved" ? "text-[#40E0D0]" : 
                    selectedCampaign.status === "rejected" ? "text-destructive" : "text-muted-foreground"
                  }
                >
                  {selectedCampaign.status === "approved" ? "Aprovada" : 
                   selectedCampaign.status === "rejected" ? "Rejeitada" : "Em Análise"}
                </span>
              )}
              {selectedCampaign?.campaignStage && (
                <span className="text-muted-foreground">
                  {selectedCampaign.campaignStage === "pre_campaign" ? "Pré-Campanha" :
                   selectedCampaign.campaignStage === "campaign" ? "Em Campanha" : "Finalizado"}
                </span>
              )}
            </div>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  <span>Data de Criação</span>
                </div>
                <p className="text-sm font-medium" data-testid="text-details-created">
                  {selectedCampaign?.createdAt && format(new Date(selectedCampaign.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
              </div>
              
              {selectedCampaign?.viewCount !== undefined && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <BarChart3 className="w-4 h-4" />
                    <span>Visualizações</span>
                  </div>
                  <p className="text-sm font-medium" data-testid="text-details-views">
                    {selectedCampaign.viewCount.toLocaleString('pt-BR')}
                  </p>
                </div>
              )}
            </div>

            {/* Region and Target Audience */}
            {(selectedCampaign?.region || selectedCampaign?.targetAudience) && (
              <div className="grid grid-cols-2 gap-4">
                {selectedCampaign?.region && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="w-4 h-4" />
                      <span>Região</span>
                    </div>
                    <p className="text-sm font-medium" data-testid="text-details-region">
                      {selectedCampaign.region}
                    </p>
                  </div>
                )}
                
                {selectedCampaign?.targetAudience && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Users className="w-4 h-4" />
                      <span>Obs:</span>
                    </div>
                    <p className="text-sm font-medium" data-testid="text-details-audience">
                      {selectedCampaign.targetAudience}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Dates and Budget Value */}
            <div className="grid grid-cols-2 gap-4">
              {selectedCampaign?.startDate && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="w-4 h-4" />
                    <span>Data de Início</span>
                  </div>
                  <p className="text-sm font-medium" data-testid="text-details-start-date">
                    {format(new Date(selectedCampaign.startDate), "dd/MM/yyyy", { locale: ptBR })}
                  </p>
                </div>
              )}
              
              {selectedCampaign?.endDate && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="w-4 h-4" />
                    <span>Data de Término</span>
                  </div>
                  <p className="text-sm font-medium" data-testid="text-details-end-date">
                    {format(new Date(selectedCampaign.endDate), "dd/MM/yyyy", { locale: ptBR })}
                  </p>
                </div>
              )}
            </div>

            {/* Budget Value */}
            <div className="p-4 bg-[#40E0D0]/10 rounded-lg border border-[#40E0D0]/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <DollarSign className="w-4 h-4 text-[#40E0D0]" />
                  <span>Valor da Pesquisa</span>
                </div>
                <p className="text-lg font-bold text-[#40E0D0]" data-testid="text-details-budget">
                  R$ {parseFloat(budgetSetting?.value || "1250").toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>

            {/* Template Info */}
            {selectedCampaign?.template && (
              <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <FileText className="w-4 h-4 text-[#40E0D0]" />
                  <span>Template Base</span>
                </div>
                <p className="text-sm text-muted-foreground" data-testid="text-details-template">
                  {selectedCampaign.template.name}
                </p>
                {selectedCampaign.template.description && (
                  <p className="text-xs text-muted-foreground">
                    {selectedCampaign.template.description}
                  </p>
                )}
              </div>
            )}

            {/* Main Question */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <MessageSquare className="w-4 h-4 text-[#40E0D0]" />
                <span>Pergunta Principal</span>
              </div>
              <Card className="p-4">
                <p className="text-sm font-medium mb-2" data-testid="text-details-main-question">
                  {selectedCampaign?.customMainQuestion || selectedCampaign?.template?.questionText || "Pergunta não definida"}
                </p>
                <span className="text-xs text-muted-foreground">
                  {(() => {
                    const type = selectedCampaign?.customMainQuestionType || selectedCampaign?.template?.questionType;
                    switch(type) {
                      case 'open_text': return 'Resposta Aberta';
                      case 'single_choice': return 'Escolha Única';
                      case 'multiple_choice': return 'Múltipla Escolha';
                      default: return type || 'Tipo não definido';
                    }
                  })()}
                </span>
                
                {/* Show options for choice questions */}
                {(selectedCampaign?.customMainQuestionOptions?.length || selectedCampaign?.template?.options?.length) && (
                  <div className="mt-3 space-y-1">
                    <p className="text-xs text-muted-foreground">Opções de resposta:</p>
                    <div className="flex flex-wrap gap-1">
                      {(selectedCampaign?.customMainQuestionOptions || selectedCampaign?.template?.options || []).map((option, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {option}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            </div>

            {/* Custom Questions */}
            {selectedCampaign?.customQuestions && selectedCampaign.customQuestions.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <MessageSquare className="w-4 h-4 text-[#40E0D0]" />
                  <span>Perguntas Adicionais ({selectedCampaign.customQuestions.length})</span>
                </div>
                <div className="space-y-2">
                  {selectedCampaign.customQuestions.map((question, index) => (
                    <Card key={question.id} className="p-4" data-testid={`card-question-${index}`}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-sm font-medium">
                          {index + 1}. {question.questionText}
                        </p>
                        {question.required && (
                          <Badge variant="destructive" className="text-xs flex-shrink-0">
                            Obrigatória
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {question.questionType === 'open_text' ? 'Resposta Aberta' :
                         question.questionType === 'single_choice' ? 'Escolha Única' : 'Múltipla Escolha'}
                      </span>
                      
                      {question.options && question.options.length > 0 && (
                        <div className="mt-2 space-y-1">
                          <p className="text-xs text-muted-foreground">Opções:</p>
                          <div className="flex flex-wrap gap-1">
                            {question.options.map((opt, optIdx) => (
                              <Badge key={optIdx} variant="outline" className="text-xs">
                                {opt}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Custom Demographic Fields */}
            {selectedCampaign?.customDemographicFields && selectedCampaign.customDemographicFields.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Users className="w-4 h-4 text-[#40E0D0]" />
                  <span>Campos Demográficos Personalizados ({selectedCampaign.customDemographicFields.length})</span>
                </div>
                <div className="space-y-2">
                  {selectedCampaign.customDemographicFields.map((field: any, index: number) => (
                    <Card key={field.id || index} className="p-4" data-testid={`card-demographic-field-${index}`}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-sm font-medium">
                          {field.label}
                        </p>
                        {field.required && (
                          <Badge variant="destructive" className="text-xs flex-shrink-0">
                            Obrigatório
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {field.fieldType === 'text' ? 'Texto Livre' :
                         field.fieldType === 'single_choice' ? 'Escolha Única' : 'Múltipla Escolha'}
                      </span>
                      
                      {field.options && field.options.length > 0 && (
                        <div className="mt-2 space-y-1">
                          <p className="text-xs text-muted-foreground">Opções:</p>
                          <div className="flex flex-wrap gap-1">
                            {field.options.map((opt: string, optIdx: number) => (
                              <Badge key={optIdx} variant="outline" className="text-xs">
                                {opt}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Admin Notes */}
            {selectedCampaign?.adminNotes && (
              <div className="space-y-2 p-4 bg-destructive/10 rounded-lg border border-destructive/20">
                <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                  <FileText className="w-4 h-4" />
                  <span>Notas do Administrador</span>
                </div>
                <p className="text-sm" data-testid="text-details-admin-notes">
                  {selectedCampaign.adminNotes}
                </p>
              </div>
            )}
          </div>

          {/* Fixed Footer */}
          <div className="flex-shrink-0 p-4 border-t bg-card">
            <div className="flex items-center gap-2">
              {selectedCampaign?.status === "approved" && (
                <>
                  <Button
                    onClick={() => {
                      if (selectedCampaign) handleCopyLink(selectedCampaign);
                    }}
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    data-testid="button-details-copy-link"
                  >
                    {copiedId === selectedCampaign?.id ? (
                      <>
                        <Check className="w-4 h-4 mr-2 text-[#40E0D0]" />
                        Copiado!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-2" />
                        Copiar Link
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setDetailsDialogOpen(false)}
                    size="sm"
                    className="flex-1"
                    data-testid="button-details-close"
                  >
                    Fechar
                  </Button>
                </>
              )}
              {selectedCampaign?.status === "under_review" && (
                <>
                  <Button
                    onClick={() => {
                      if (selectedCampaign) {
                        setDetailsDialogOpen(false);
                        handleApprove(selectedCampaign);
                      }
                    }}
                    disabled={approveMutation.isPending}
                    size="sm"
                    className="flex-1 bg-[#40E0D0] hover:bg-[#40E0D0]/90 text-white"
                    data-testid="button-details-approve"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Aprovar
                  </Button>
                  <Button
                    onClick={() => {
                      if (selectedCampaign) {
                        setDetailsDialogOpen(false);
                        handleRejectClick(selectedCampaign);
                      }
                    }}
                    disabled={rejectMutation.isPending}
                    size="sm"
                    variant="destructive"
                    className="flex-1"
                    data-testid="button-details-reject"
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Rejeitar
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setDetailsDialogOpen(false)}
                    size="sm"
                    className="flex-1"
                    data-testid="button-details-close"
                  >
                    Fechar
                  </Button>
                </>
              )}
              {selectedCampaign?.status === "rejected" && (
                <Button
                  variant="outline"
                  onClick={() => setDetailsDialogOpen(false)}
                  size="sm"
                  className="flex-1"
                  data-testid="button-details-close"
                >
                  Fechar
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Budget ADS Dialog */}
      <Dialog open={budgetDialogOpen} onOpenChange={setBudgetDialogOpen}>
        <DialogContent data-testid="dialog-budget-ads">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" data-testid="text-budget-title">
              <DollarSign className="w-5 h-5 text-[#40E0D0]" />
              Budget ADS
            </DialogTitle>
            <DialogDescription data-testid="text-budget-description">
              Defina o valor cobrado por cada pesquisa que inclui campanha de ADS.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="budget-value" className="text-sm font-medium">
                Valor por Pesquisa (R$)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">R$</span>
                <input
                  id="budget-value"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="1250.00"
                  value={budgetValue}
                  onChange={(e) => setBudgetValue(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-transparent pl-10 pr-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  data-testid="input-budget-value"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Este valor será utilizado para calcular o total da caixa de pesquisas.
              </p>
            </div>
          </div>

          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setBudgetDialogOpen(false)}
              disabled={updateBudgetMutation.isPending}
              className="flex-1"
              data-testid="button-cancel-budget"
            >
              Cancelar
            </Button>
            <Button
              onClick={() => updateBudgetMutation.mutate(budgetValue)}
              disabled={updateBudgetMutation.isPending || !budgetValue}
              className="flex-1 bg-[#40E0D0] hover:bg-[#40E0D0]/90 text-white"
              data-testid="button-save-budget"
            >
              {updateBudgetMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* System Sync Dialog - PULL from source server */}
      <Dialog open={syncDialogOpen} onOpenChange={setSyncDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0" data-testid="dialog-sync-system">
          {/* Fixed Header */}
          <div className="sticky top-0 z-10 bg-background border-b px-6 pt-6 pb-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2" data-testid="text-sync-title">
                <Server className="w-5 h-5 text-[#40E0D0]" />
                Atualizar Sistema
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSyncRequirementsOpen(true)}
                  className="ml-auto"
                  data-testid="button-sync-requirements-info"
                >
                  <Info className="w-5 h-5 text-blue-500" />
                </Button>
              </DialogTitle>
              <DialogDescription data-testid="text-sync-description">
                Esta ação irá PUXAR todos os dados do servidor fonte (Replit) para este servidor.
              </DialogDescription>
            </DialogHeader>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-[#40E0D0]" />
                <span className="text-sm font-medium">O que será importado:</span>
              </div>
              <ul className="text-sm text-muted-foreground space-y-1 ml-6 list-disc">
                <li>Código-fonte completo (exceto node_modules)</li>
                <li>Banco de dados PostgreSQL (dump completo)</li>
                <li>Variáveis de ambiente (SESSION_SECRET, DATABASE_URL, etc.)</li>
                <li>Configuração do Admin Master (.admin-config.json)</li>
                <li>Arquivos anexos locais</li>
              </ul>
            </div>
            
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
              <p className="text-sm text-yellow-600 dark:text-yellow-400">
                <strong>Atenção:</strong> Os dados locais serão substituídos pelos dados do servidor fonte.
              </p>
            </div>
            
            <div className="space-y-3">
              <div className="space-y-2">
                <label htmlFor="sync-source-url" className="text-sm font-medium">
                  URL do Servidor Fonte (Replit)
                </label>
                <input
                  id="sync-source-url"
                  type="url"
                  placeholder="https://seu-replit-app.replit.app"
                  value={syncTargetUrl}
                  onChange={(e) => setSyncTargetUrl(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  data-testid="input-sync-source-url"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="sync-api-key" className="text-sm font-medium">
                  Chave de API (SYNC_API_KEY do Replit)
                </label>
                <input
                  id="sync-api-key"
                  type="password"
                  placeholder="Digite a SYNC_API_KEY configurada no Replit"
                  value={syncApiKey}
                  onChange={(e) => setSyncApiKey(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  data-testid="input-sync-api-key"
                />
              </div>
            </div>
          </div>

          {/* Fixed Footer */}
          <div className="sticky bottom-0 z-10 bg-background border-t px-6 py-4">
            <DialogFooter className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setSyncDialogOpen(false)}
                disabled={systemSyncMutation.isPending}
                className="flex-1"
                data-testid="button-cancel-sync"
              >
                Cancelar
              </Button>
              <Button
                onClick={() => systemSyncMutation.mutate({ sourceUrl: syncTargetUrl, apiKey: syncApiKey })}
                disabled={systemSyncMutation.isPending || !syncTargetUrl || !syncApiKey}
                className="flex-1 bg-[#40E0D0] hover:bg-[#40E0D0]/90 text-white"
                data-testid="button-confirm-sync"
              >
                {systemSyncMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importando...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Importar do Replit
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Server Requirements Info Dialog */}
      <Dialog open={syncRequirementsOpen} onOpenChange={setSyncRequirementsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0" data-testid="dialog-sync-requirements">
          {/* Fixed Header */}
          <div className="sticky top-0 z-10 bg-background border-b px-6 pt-6 pb-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2" data-testid="text-requirements-title">
                <Info className="w-5 h-5 text-blue-500" />
                Requisitos do Servidor para Sincronização
              </DialogTitle>
              <DialogDescription>
                Para que a sincronização funcione corretamente, o servidor de destino precisa atender aos seguintes requisitos.
              </DialogDescription>
            </DialogHeader>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {/* Ferramentas Necessárias */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-[#40E0D0]" />
                <span className="font-semibold">Ferramentas de Linha de Comando</span>
              </div>
              <div className="space-y-2 ml-7">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-medium">unzip</span>
                    <p className="text-sm text-muted-foreground">Para extrair código-fonte e arquivos anexos</p>
                    <code className="text-xs bg-muted px-2 py-1 rounded">sudo apt install unzip</code>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-medium">psql (PostgreSQL Client)</span>
                    <p className="text-sm text-muted-foreground">Para restaurar o banco de dados</p>
                    <code className="text-xs bg-muted px-2 py-1 rounded">sudo apt install postgresql-client</code>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-medium">Node.js 18+</span>
                    <p className="text-sm text-muted-foreground">Para executar a aplicação</p>
                    <code className="text-xs bg-muted px-2 py-1 rounded">node --version</code>
                  </div>
                </div>
              </div>
            </div>

            {/* Variáveis de Ambiente */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-yellow-500" />
                <span className="font-semibold">Variáveis de Ambiente Obrigatórias</span>
              </div>
              <div className="space-y-2 ml-7">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-medium">SYNC_API_KEY</span>
                    <p className="text-sm text-muted-foreground">Mesma chave configurada no Replit (deve ser idêntica)</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-medium">DATABASE_URL</span>
                    <p className="text-sm text-muted-foreground">URL de conexão PostgreSQL local para receber os dados</p>
                    <code className="text-xs bg-muted px-2 py-1 rounded">postgresql://user:pass@localhost:5432/db</code>
                  </div>
                </div>
              </div>
            </div>

            {/* Banco de Dados */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-purple-500" />
                <span className="font-semibold">Banco de Dados PostgreSQL</span>
              </div>
              <div className="space-y-2 ml-7 text-sm text-muted-foreground">
                <p>• PostgreSQL 14+ instalado e rodando</p>
                <p>• Banco de dados criado e acessível via DATABASE_URL</p>
                <p>• Usuário com permissões de CREATE, DROP, INSERT, UPDATE, DELETE</p>
                <p>• Conexão liberada (firewall, pg_hba.conf)</p>
              </div>
            </div>

            {/* Permissões de Arquivo */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-orange-500" />
                <span className="font-semibold">Permissões de Sistema de Arquivos</span>
              </div>
              <div className="space-y-2 ml-7 text-sm text-muted-foreground">
                <p>• Permissão de escrita no diretório do projeto</p>
                <p>• Permissão de escrita em <code className="bg-muted px-1 rounded">.env</code></p>
                <p>• Permissão de escrita em <code className="bg-muted px-1 rounded">attached_assets/</code></p>
                <p>• Permissão de escrita em <code className="bg-muted px-1 rounded">.admin-config.json</code></p>
              </div>
            </div>

            {/* Espaço em Disco */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-gray-500" />
                <span className="font-semibold">Recursos do Sistema</span>
              </div>
              <div className="space-y-2 ml-7 text-sm text-muted-foreground">
                <p>• Mínimo 2GB de espaço em disco livre</p>
                <p>• Mínimo 1GB de RAM disponível</p>
                <p>• Conexão de rede estável com o servidor Replit</p>
              </div>
            </div>

            {/* Aviso Importante */}
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-red-600 dark:text-red-400">Aviso Importante</p>
                  <p className="text-sm text-red-600/80 dark:text-red-400/80 mt-1">
                    A sincronização irá SOBRESCREVER todos os dados locais. Faça backup antes de prosseguir!
                    Certifique-se de que todas as ferramentas estão instaladas e permissões configuradas.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Fixed Footer */}
          <div className="sticky bottom-0 z-10 bg-background border-t px-6 py-4">
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setSyncRequirementsOpen(false)}
                className="w-full"
                data-testid="button-close-requirements"
              >
                Entendi
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
