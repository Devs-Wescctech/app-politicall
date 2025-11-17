import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  type SurveyTemplate,
  type SurveyCampaign,
  type InsertSurveyCampaign,
  insertSurveyCampaignSchema
} from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, Edit, ExternalLink, Copy, CheckCircle, XCircle, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useCurrentUser } from "@/hooks/use-current-user";

const SURVEY_STATUS_CONFIG = {
  under_review: { 
    label: "Em Análise", 
    color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    icon: Clock
  },
  approved: { 
    label: "Aprovado", 
    color: "bg-[#40E0D0] text-white dark:bg-[#48D1CC] dark:text-gray-900",
    icon: CheckCircle
  },
  rejected: { 
    label: "Rejeitado", 
    color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    icon: XCircle
  },
  active: { 
    label: "Ativo", 
    color: "bg-[#40E0D0] text-white dark:bg-[#48D1CC] dark:text-gray-900",
    icon: CheckCircle
  },
  paused: { 
    label: "Pausado", 
    color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
    icon: Clock
  },
  completed: { 
    label: "Concluído", 
    color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    icon: CheckCircle
  },
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface CampaignWithTemplate extends SurveyCampaign {
  template?: SurveyTemplate;
  responseCount?: number;
}


export default function Marketing() {
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [showCampaignDialog, setShowCampaignDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<SurveyTemplate | null>(null);
  const [campaignToDelete, setCampaignToDelete] = useState<string | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<CampaignWithTemplate | null>(null);

  const form = useForm<InsertSurveyCampaign>({
    resolver: zodResolver(insertSurveyCampaignSchema),
    defaultValues: {
      templateId: "",
      campaignName: "",
      slug: "",
      status: "under_review",
      startDate: null,
      endDate: null,
      targetAudience: null,
      adminReviewerId: null,
      adminNotes: null,
    },
  });

  const { data: templates, isLoading: templatesLoading } = useQuery<SurveyTemplate[]>({
    queryKey: ["/api/survey-templates"],
  });

  const { data: campaigns, isLoading: campaignsLoading } = useQuery<CampaignWithTemplate[]>({
    queryKey: ["/api/survey-campaigns"],
  });

  const createMutation = useMutation({
    mutationFn: (data: InsertSurveyCampaign) => apiRequest("POST", "/api/survey-campaigns", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/survey-campaigns"] });
      toast({ title: "Campanha criada com sucesso!" });
      setShowCampaignDialog(false);
      setSelectedTemplate(null);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Erro ao criar campanha", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InsertSurveyCampaign> }) => 
      apiRequest("PATCH", `/api/survey-campaigns/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/survey-campaigns"] });
      toast({ title: "Campanha atualizada com sucesso!" });
      setShowCampaignDialog(false);
      setEditingCampaign(null);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Erro ao atualizar campanha", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/survey-campaigns/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/survey-campaigns"] });
      toast({ title: "Campanha removida com sucesso!" });
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Erro ao remover campanha", variant: "destructive" });
    },
  });

  const handleTemplateSelect = (template: SurveyTemplate) => {
    setSelectedTemplate(template);
    setShowTemplateDialog(false);
    setShowCampaignDialog(true);
    form.setValue("templateId", template.id);
  };

  const handleCreateClick = () => {
    setEditingCampaign(null);
    setSelectedTemplate(null);
    form.reset();
    setShowTemplateDialog(true);
  };

  const handleEditClick = (campaign: CampaignWithTemplate) => {
    setEditingCampaign(campaign);
    setSelectedTemplate(campaign.template || null);
    form.reset({
      templateId: campaign.templateId,
      campaignName: campaign.campaignName,
      slug: campaign.slug,
      status: campaign.status,
      startDate: campaign.startDate,
      endDate: campaign.endDate,
      targetAudience: campaign.targetAudience,
      adminReviewerId: campaign.adminReviewerId,
      adminNotes: campaign.adminNotes,
    });
    setShowCampaignDialog(true);
  };

  const handleDeleteClick = (campaignId: string) => {
    setCampaignToDelete(campaignId);
    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = async () => {
    if (campaignToDelete) {
      await deleteMutation.mutateAsync(campaignToDelete);
    }
    setShowDeleteDialog(false);
    setCampaignToDelete(null);
  };

  const handleSubmit = async (data: InsertSurveyCampaign) => {
    if (editingCampaign) {
      await updateMutation.mutateAsync({ id: editingCampaign.id, data });
    } else {
      await createMutation.mutateAsync(data);
    }
  };

  const handleCampaignNameChange = (name: string) => {
    form.setValue("campaignName", name);
    if (!editingCampaign) {
      form.setValue("slug", slugify(name));
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "URL copiada para área de transferência!" });
    } catch (error) {
      toast({ title: "Erro ao copiar URL", variant: "destructive" });
    }
  };

  const getLandingPageUrl = (slug: string) => {
    return `https://www.politicall.com.br/survey/${slug}`;
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Campanhas de Pesquisa</h1>
          <p className="text-muted-foreground mt-2">
            Crie e gerencie pesquisas de opinião pública
          </p>
        </div>
        <Button
          onClick={handleCreateClick}
          className="rounded-full"
          data-testid="button-create-campaign"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nova Campanha
        </Button>
      </div>

      <div className="grid lg:grid-cols-1 gap-6">
        {campaignsLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        ) : campaigns && campaigns.length > 0 ? (
          <div className="space-y-4">
            {campaigns.map((campaign) => {
              const statusConfig = SURVEY_STATUS_CONFIG[campaign.status as keyof typeof SURVEY_STATUS_CONFIG];
              const StatusIcon = statusConfig.icon;
              const isApproved = campaign.status === "approved" || campaign.status === "active";
              const landingUrl = getLandingPageUrl(campaign.slug);

              return (
                <Card key={campaign.id} className="hover-elevate" data-testid={`card-campaign-${campaign.id}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <CardTitle className="text-xl" data-testid={`text-campaign-name-${campaign.id}`}>
                            {campaign.campaignName}
                          </CardTitle>
                          <Badge className={statusConfig.color} data-testid={`badge-status-${campaign.id}`}>
                            <StatusIcon className="w-3 h-3 mr-1" />
                            {statusConfig.label}
                          </Badge>
                          {campaign.responseCount !== undefined && (
                            <Badge variant="outline" data-testid={`badge-responses-${campaign.id}`}>
                              {campaign.responseCount} respostas
                            </Badge>
                          )}
                        </div>
                        {campaign.template && (
                          <CardDescription className="text-sm" data-testid={`text-template-${campaign.id}`}>
                            Template: {campaign.template.name}
                          </CardDescription>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="rounded-full"
                          onClick={() => handleEditClick(campaign)}
                          data-testid={`button-edit-${campaign.id}`}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="icon"
                          className="rounded-full"
                          onClick={() => handleDeleteClick(campaign.id)}
                          data-testid={`button-delete-${campaign.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {isApproved && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">URL da Página de Pesquisa:</Label>
                        <div className="flex gap-2">
                          <Input
                            value={landingUrl}
                            readOnly
                            className="font-mono text-sm"
                            data-testid={`input-landing-url-${campaign.id}`}
                          />
                          <Button
                            variant="outline"
                            size="icon"
                            className="rounded-full flex-shrink-0"
                            onClick={() => copyToClipboard(landingUrl)}
                            data-testid={`button-copy-url-${campaign.id}`}
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="rounded-full flex-shrink-0"
                            onClick={() => window.open(landingUrl, "_blank")}
                            data-testid={`button-open-url-${campaign.id}`}
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}

                    {campaign.targetAudience && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Público-Alvo:</Label>
                        <p className="text-sm text-muted-foreground" data-testid={`text-target-audience-${campaign.id}`}>
                          {campaign.targetAudience}
                        </p>
                      </div>
                    )}

                    {campaign.adminNotes && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Notas do Administrador:</Label>
                        <p className="text-sm text-muted-foreground" data-testid={`text-admin-notes-${campaign.id}`}>
                          {campaign.adminNotes}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="text-center py-12">
            <CardContent>
              <p className="text-muted-foreground mb-4">Nenhuma campanha criada ainda</p>
              <Button
                onClick={handleCreateClick}
                className="rounded-full"
                data-testid="button-create-first-campaign"
              >
                <Plus className="w-4 h-4 mr-2" />
                Criar Primeira Campanha
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Selecione um Template de Pesquisa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {templatesLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24 rounded-lg" />
                ))}
              </div>
            ) : templates && templates.length > 0 ? (
              templates.map((template) => (
                <Card
                  key={template.id}
                  className="cursor-pointer hover-elevate active-elevate-2"
                  onClick={() => handleTemplateSelect(template)}
                  data-testid={`card-template-${template.id}`}
                >
                  <CardHeader>
                    <CardTitle className="text-lg" data-testid={`text-template-name-${template.id}`}>
                      {template.name}
                    </CardTitle>
                    {template.description && (
                      <CardDescription data-testid={`text-template-description-${template.id}`}>
                        {template.description}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Pergunta:</Label>
                      <p className="text-sm" data-testid={`text-template-question-${template.id}`}>
                        {template.questionText}
                      </p>
                      {template.options && template.options.length > 0 && (
                        <div className="mt-2">
                          <Label className="text-sm font-medium">Opções:</Label>
                          <ul className="list-disc list-inside text-sm text-muted-foreground">
                            {template.options.map((option, idx) => (
                              <li key={idx}>{option}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <p className="text-center text-muted-foreground py-8">
                Nenhum template disponível
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showCampaignDialog} onOpenChange={setShowCampaignDialog}>
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>
              {editingCampaign ? "Editar Campanha" : "Nova Campanha de Pesquisa"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                {selectedTemplate && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Template Selecionado:</Label>
                    <Card>
                      <CardContent className="pt-4">
                        <p className="font-medium" data-testid="text-selected-template-name">
                          {selectedTemplate.name}
                        </p>
                        <p className="text-sm text-muted-foreground" data-testid="text-selected-template-question">
                          {selectedTemplate.questionText}
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="campaignName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome da Campanha *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Ex: Pesquisa de Opinião Pública 2025"
                          onChange={(e) => handleCampaignNameChange(e.target.value)}
                          data-testid="input-campaign-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="slug"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Slug (URL) *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="pesquisa-opiniao-publica-2025"
                          data-testid="input-slug"
                        />
                      </FormControl>
                      <FormDescription>
                        URL amigável para a página de pesquisa
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="targetAudience"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Público-Alvo (Opcional)</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          value={field.value || ""}
                          placeholder="Descreva o público-alvo desta pesquisa..."
                          className="min-h-20"
                          data-testid="textarea-target-audience"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data de Início</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            {...field}
                            value={field.value ? new Date(field.value).toISOString().split('T')[0] : ""}
                            onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : null)}
                            data-testid="input-start-date"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data de Término</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            {...field}
                            value={field.value ? new Date(field.value).toISOString().split('T')[0] : ""}
                            onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : null)}
                            data-testid="input-end-date"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </form>
            </Form>
          </div>
          <DialogFooter className="flex-shrink-0">
            <Button
              variant="outline"
              onClick={() => setShowCampaignDialog(false)}
              className="rounded-full"
              data-testid="button-cancel-campaign"
            >
              Cancelar
            </Button>
            <Button
              onClick={form.handleSubmit(handleSubmit)}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="rounded-full bg-[#40E0D0] hover:bg-[#48D1CC] text-white"
              data-testid="button-submit-campaign"
            >
              {createMutation.isPending || updateMutation.isPending
                ? "Salvando..."
                : editingCampaign
                ? "Atualizar Campanha"
                : "Criar Campanha"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta campanha? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full" data-testid="button-cancel-delete">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending}
              className="rounded-full bg-red-600 hover:bg-red-700 text-white"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
