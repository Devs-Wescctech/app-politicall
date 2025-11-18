import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle2, XCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import logoUrl from "@assets/logo pol_1763308638963.png";

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

type CampaignWithTemplate = SurveyCampaign & {
  template?: SurveyTemplate;
};

export default function Admin() {
  const [, setLocation] = useLocation();
  const [isVerifying, setIsVerifying] = useState(true);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignWithTemplate | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const { toast } = useToast();

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/survey-campaigns"] });
      toast({
        title: "Campanha aprovada",
        description: "A campanha foi aprovada com sucesso.",
      });
    },
    onError: (error: Error) => {
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
    onError: (error: Error) => {
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/survey-campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/survey-campaigns"] });
      toast({
        title: "Estágio atualizado",
        description: "O estágio da campanha foi atualizado com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar estágio",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleLogout = () => {
    localStorage.removeItem("admin_token");
    setLocation("/login");
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

  if (isVerifying) {
    return null;
  }

  // Filter campaigns by stage and status
  const allCampaigns = campaigns || [];
  
  // Filter by campaign stage for kanban
  const aguardandoCampaigns = allCampaigns.filter(c => c.campaignStage === "aguardando");
  const aprovadoCampaigns = allCampaigns.filter(c => c.campaignStage === "aprovado");
  const emProducaoCampaigns = allCampaigns.filter(c => c.campaignStage === "em_producao");
  const finalizadoCampaigns = allCampaigns.filter(c => c.campaignStage === "finalizado");
  
  // Filter by status for tabs
  const pendingCampaigns = allCampaigns.filter(c => c.status === "under_review");
  const approvedCampaigns = allCampaigns.filter(c => c.status === "approved");
  const rejectedCampaigns = allCampaigns.filter(c => c.status === "rejected");

  const getStageBadge = (campaignStage: string) => {
    switch (campaignStage) {
      case "aguardando":
        return <Badge variant="secondary" className="bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100">Aguardando</Badge>;
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

    return (
      <Card key={campaign.id} className="hover-elevate" data-testid={`card-campaign-${campaign.id}`}>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base" data-testid={`text-campaign-name-${campaign.id}`}>
              {campaign.campaignName}
            </CardTitle>
            {getStageBadge(campaign.campaignStage)}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            {campaign.template && (
              <div data-testid={`text-template-${campaign.id}`}>
                <p className="text-xs font-medium text-muted-foreground">Template</p>
                <p className="text-sm">{campaign.template.name}</p>
              </div>
            )}
            
            <div data-testid={`text-created-${campaign.id}`}>
              <p className="text-xs font-medium text-muted-foreground">Data de criação</p>
              <p className="text-sm">
                {format(new Date(campaign.createdAt), "dd/MM/yyyy", { locale: ptBR })}
              </p>
            </div>

            {campaign.targetAudience && (
              <div data-testid={`text-audience-${campaign.id}`}>
                <p className="text-xs font-medium text-muted-foreground">Público-alvo</p>
                <p className="text-sm">{campaign.targetAudience}</p>
              </div>
            )}

            {campaign.adminNotes && (
              <div data-testid={`text-admin-notes-${campaign.id}`}>
                <p className="text-xs font-medium text-muted-foreground">Notas do Admin</p>
                <p className="text-sm">{campaign.adminNotes}</p>
              </div>
            )}
          </div>

          {campaign.status === "under_review" && (
            <div className="flex gap-2 pt-2">
              <Button
                onClick={() => handleApprove(campaign)}
                disabled={approveMutation.isPending}
                size="sm"
                className="flex-1 bg-[#40E0D0] hover:bg-[#48D1CC] text-white"
                data-testid={`button-approve-${campaign.id}`}
              >
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Aprovar
              </Button>
              <Button
                onClick={() => handleRejectClick(campaign)}
                disabled={rejectMutation.isPending}
                size="sm"
                variant="destructive"
                className="flex-1"
                data-testid={`button-reject-${campaign.id}`}
              >
                <XCircle className="w-3 h-3 mr-1" />
                Rejeitar
              </Button>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            {currentStageInfo.prev && (
              <Button
                onClick={() => handleMoveStage(campaign.id, currentStageInfo.prev!)}
                disabled={updateStageMutation.isPending}
                size="sm"
                variant="outline"
                className="flex-1"
                data-testid={`button-stage-prev-${campaign.id}`}
              >
                <ChevronLeft className="w-3 h-3 mr-1" />
                Voltar
              </Button>
            )}
            {currentStageInfo.next && (
              <Button
                onClick={() => handleMoveStage(campaign.id, currentStageInfo.next!)}
                disabled={updateStageMutation.isPending}
                size="sm"
                variant="outline"
                className="flex-1"
                data-testid={`button-stage-next-${campaign.id}`}
              >
                Avançar
                <ChevronRight className="w-3 h-3 ml-1" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Fixed Header */}
      <header className="sticky top-0 z-50 bg-card border-b">
        <div className="flex items-center justify-between px-6 py-4">
          <img src={logoUrl} alt="Politicall Logo" className="h-10" data-testid="img-logo" />
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Área Administrativa</h1>
          <Button 
            onClick={handleLogout} 
            variant="outline"
            className="rounded-full"
            data-testid="button-logout"
          >
            Sair
          </Button>
        </div>
      </header>

      {/* Main Content - Kanban Board */}
      <main className="container mx-auto p-6">
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2" data-testid="text-kanban-title">Kanban de Estágios</h2>
          <p className="text-sm text-muted-foreground" data-testid="text-kanban-subtitle">
            Gerencie as campanhas de pesquisa através dos diferentes estágios
          </p>
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

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectDialogOpen(false);
                setRejectNotes("");
                setSelectedCampaign(null);
              }}
              data-testid="button-cancel-reject"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleRejectConfirm}
              disabled={rejectMutation.isPending}
              variant="destructive"
              data-testid="button-confirm-reject"
            >
              Confirmar Rejeição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
