import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import logoUrl from "@assets/logo pol_1763308638963.png";

type SurveyCampaign = {
  id: string;
  userId: string;
  templateId: string;
  campaignName: string;
  slug: string;
  status: string;
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

  if (isVerifying) {
    return null;
  }

  // Filter campaigns by status
  const allCampaigns = campaigns || [];
  const pendingCampaigns = allCampaigns.filter(c => c.status === "under_review");
  const approvedCampaigns = allCampaigns.filter(c => c.status === "approved");
  const rejectedCampaigns = allCampaigns.filter(c => c.status === "rejected");

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "under_review":
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Em Análise</Badge>;
      case "approved":
        return <Badge className="bg-[#40E0D0] text-white">Aprovado</Badge>;
      case "rejected":
        return <Badge variant="destructive">Rejeitado</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const renderCampaignCard = (campaign: CampaignWithTemplate) => (
    <Card key={campaign.id} className="hover-elevate" data-testid={`card-campaign-${campaign.id}`}>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg" data-testid={`text-campaign-name-${campaign.id}`}>
            {campaign.campaignName}
          </CardTitle>
          {getStatusBadge(campaign.status)}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {campaign.template && (
            <div data-testid={`text-template-${campaign.id}`}>
              <p className="text-sm font-medium text-muted-foreground">Template</p>
              <p className="text-sm">{campaign.template.name}</p>
            </div>
          )}
          
          <div data-testid={`text-created-${campaign.id}`}>
            <p className="text-sm font-medium text-muted-foreground">Data de criação</p>
            <p className="text-sm">
              {format(new Date(campaign.createdAt), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </p>
          </div>

          {campaign.targetAudience && (
            <div data-testid={`text-audience-${campaign.id}`}>
              <p className="text-sm font-medium text-muted-foreground">Público-alvo</p>
              <p className="text-sm">{campaign.targetAudience}</p>
            </div>
          )}

          {campaign.startDate && (
            <div data-testid={`text-start-date-${campaign.id}`}>
              <p className="text-sm font-medium text-muted-foreground">Data de início</p>
              <p className="text-sm">
                {format(new Date(campaign.startDate), "dd/MM/yyyy")}
              </p>
            </div>
          )}

          {campaign.endDate && (
            <div data-testid={`text-end-date-${campaign.id}`}>
              <p className="text-sm font-medium text-muted-foreground">Data de término</p>
              <p className="text-sm">
                {format(new Date(campaign.endDate), "dd/MM/yyyy")}
              </p>
            </div>
          )}

          {campaign.adminNotes && (
            <div data-testid={`text-admin-notes-${campaign.id}`}>
              <p className="text-sm font-medium text-muted-foreground">Notas do Admin</p>
              <p className="text-sm">{campaign.adminNotes}</p>
            </div>
          )}

          <div data-testid={`text-slug-${campaign.id}`}>
            <p className="text-sm font-medium text-muted-foreground">URL da Pesquisa</p>
            <p className="text-xs text-[#40E0D0] break-all">
              https://politicall.com.br/pesquisa/{campaign.slug}
            </p>
          </div>
        </div>

        {campaign.status === "under_review" && (
          <div className="flex gap-2 pt-2">
            <Button
              onClick={() => handleApprove(campaign)}
              disabled={approveMutation.isPending}
              className="rounded-full flex-1 bg-[#40E0D0] hover:bg-[#48D1CC] text-white"
              data-testid={`button-approve-${campaign.id}`}
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Aprovar
            </Button>
            <Button
              onClick={() => handleRejectClick(campaign)}
              disabled={rejectMutation.isPending}
              variant="destructive"
              className="rounded-full flex-1"
              data-testid={`button-reject-${campaign.id}`}
            >
              <XCircle className="w-4 h-4 mr-2" />
              Rejeitar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

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

      {/* Main Content */}
      <main className="container mx-auto p-6">
        <Tabs defaultValue="all" className="w-full">
          <TabsList data-testid="tabs-admin">
            <TabsTrigger value="all" data-testid="tab-all">
              Todas ({allCampaigns.length})
            </TabsTrigger>
            <TabsTrigger value="pending" data-testid="tab-pending">
              Pendentes ({pendingCampaigns.length})
            </TabsTrigger>
            <TabsTrigger value="approved" data-testid="tab-approved">
              Aprovadas ({approvedCampaigns.length})
            </TabsTrigger>
            <TabsTrigger value="rejected" data-testid="tab-rejected">
              Rejeitadas ({rejectedCampaigns.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-6">
            {isLoading && (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <Card key={i} data-testid={`skeleton-card-${i}`}>
                    <CardHeader>
                      <Skeleton className="h-6 w-3/4" />
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-4 w-1/2" />
                    </CardContent>
                  </Card>
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

            {!isLoading && !error && allCampaigns.length === 0 && (
              <Card className="p-8" data-testid="card-empty">
                <p className="text-center text-muted-foreground text-lg" data-testid="text-empty">
                  Nenhuma campanha criada ainda
                </p>
              </Card>
            )}

            {!isLoading && !error && allCampaigns.length > 0 && (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {allCampaigns.map(renderCampaignCard)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="pending" className="mt-6">
            {isLoading && (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <Card key={i} data-testid={`skeleton-card-${i}`}>
                    <CardHeader>
                      <Skeleton className="h-6 w-3/4" />
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-4 w-1/2" />
                    </CardContent>
                  </Card>
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

            {!isLoading && !error && pendingCampaigns.length === 0 && (
              <Card className="p-8" data-testid="card-empty">
                <p className="text-center text-muted-foreground text-lg" data-testid="text-empty">
                  Nenhuma campanha pendente de aprovação
                </p>
              </Card>
            )}

            {!isLoading && !error && pendingCampaigns.length > 0 && (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {pendingCampaigns.map(renderCampaignCard)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="approved" className="mt-6">
            {!isLoading && !error && approvedCampaigns.length === 0 && (
              <Card className="p-8" data-testid="card-empty-approved">
                <p className="text-center text-muted-foreground text-lg" data-testid="text-empty">
                  Nenhuma campanha aprovada ainda
                </p>
              </Card>
            )}

            {!isLoading && !error && approvedCampaigns.length > 0 && (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {approvedCampaigns.map(renderCampaignCard)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="rejected" className="mt-6">
            {!isLoading && !error && rejectedCampaigns.length === 0 && (
              <Card className="p-8" data-testid="card-empty-rejected">
                <p className="text-center text-muted-foreground text-lg" data-testid="text-empty">
                  Nenhuma campanha rejeitada
                </p>
              </Card>
            )}

            {!isLoading && !error && rejectedCampaigns.length > 0 && (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {rejectedCampaigns.map(renderCampaignCard)}
              </div>
            )}
          </TabsContent>
        </Tabs>
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
