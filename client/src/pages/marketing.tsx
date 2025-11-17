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
import { Separator } from "@/components/ui/separator";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, Edit, ExternalLink, Copy, CheckCircle, XCircle, Clock, BarChart3, ChevronDown, ChevronUp, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

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
  viewCount?: number;
}


const CHART_COLORS = ["#40E0D0", "#48D1CC", "#5FEDD8", "#76F5E6", "#8DFCF4", "#A4FFF9"];

const DEMOGRAPHIC_LABELS: Record<string, Record<string, string>> = {
  gender: {
    masculino: "Masculino",
    feminino: "Feminino",
    outro: "Outro",
    prefiro_nao_dizer: "Prefiro não dizer"
  },
  ageRange: {
    menos_35: "Menos de 35",
    mais_35: "35 ou mais"
  },
  employmentType: {
    carteira_assinada: "Carteira Assinada",
    autonomo: "Autônomo",
    desempregado: "Desempregado",
    aposentado: "Aposentado",
    outro: "Outro"
  },
  housingType: {
    casa_propria: "Casa Própria",
    aluguel: "Aluguel",
    cedido: "Cedido",
    outro: "Outro"
  },
  hasChildren: {
    sim: "Sim",
    nao: "Não"
  },
  politicalIdeology: {
    direita: "Direita",
    centro: "Centro",
    esquerda: "Esquerda",
    prefiro_nao_comentar: "Prefiro não comentar"
  }
};

interface SurveyResultsProps {
  campaignId: string;
  template?: SurveyTemplate;
  viewCount?: number;
}

interface GroupedTextResponse {
  displayText: string;
  normalizedText: string;
  count: number;
}

interface ResponsesData {
  responses: any[];
  grouped?: GroupedTextResponse[];
  questionType?: string;
}

function SurveyResults({ campaignId, template, viewCount = 0 }: SurveyResultsProps) {
  const { data: responseData, isLoading } = useQuery<ResponsesData>({
    queryKey: ["/api/survey-campaigns", campaignId, "responses"],
    enabled: !!campaignId,
  });

  if (isLoading) {
    return (
      <div className="space-y-4 mt-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Handle both old and new API response formats
  const responses = Array.isArray(responseData) ? responseData : (responseData?.responses || []);
  const groupedResponses = !Array.isArray(responseData) ? responseData?.grouped : undefined;

  if (!responses || responses.length === 0) {
    return (
      <Card className="mt-4 bg-muted/30">
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">Nenhuma resposta recebida ainda</p>
        </CardContent>
      </Card>
    );
  }

  // Process demographic data
  const processData = (field: string) => {
    const counts: Record<string, number> = {};
    responses.forEach(r => {
      const value = r[field];
      counts[value] = (counts[value] || 0) + 1;
    });
    return Object.entries(counts).map(([key, value]) => ({
      name: DEMOGRAPHIC_LABELS[field]?.[key] || key,
      value,
      percentage: ((value / responses.length) * 100).toFixed(1)
    }));
  };

  const DEMOGRAPHIC_TITLES: Record<string, string> = {
    gender: "Sexo",
    ageRange: "Faixa Etária",
    employmentType: "Tipo de Trabalho",
    housingType: "Tipo de Moradia",
    hasChildren: "Tem Filhos",
    politicalIdeology: "Ideologia Política"
  };

  // Process survey responses
  const processResponseData = () => {
    if (!template) return [];

    if (template.questionType === "single_choice" || template.questionType === "multiple_choice") {
      const counts: Record<string, number> = {};
      responses.forEach(r => {
        const data = r.responseData;
        if (template.questionType === "single_choice" && data.answer) {
          counts[data.answer] = (counts[data.answer] || 0) + 1;
        } else if (template.questionType === "multiple_choice" && data.answers) {
          data.answers.forEach((ans: string) => {
            counts[ans] = (counts[ans] || 0) + 1;
          });
        }
      });
      return Object.entries(counts).map(([key, value]) => ({
        name: key,
        value,
        percentage: ((value / responses.length) * 100).toFixed(1)
      })).sort((a, b) => b.value - a.value);
    }

    if (template.questionType === "rating" && template.options) {
      return template.options.map(option => {
        const ratings = responses
          .map(r => r.responseData?.ratings?.[option])
          .filter(r => r !== undefined);
        const avg = ratings.length > 0
          ? (ratings.reduce((sum, r) => sum + r, 0) / ratings.length).toFixed(1)
          : "0.0";
        return { name: option, rating: parseFloat(avg), responses: ratings.length };
      });
    }

    return [];
  };

  const surveyData = processResponseData();

  return (
    <div className="space-y-6 mt-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-gradient-to-br from-[#40E0D0] to-[#48D1CC] text-white">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-90">Visualizações da URL</p>
                <p className="text-4xl font-bold mt-2">{viewCount}</p>
              </div>
              <Eye className="w-12 h-12 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-[#48D1CC] to-[#40E0D0] text-white">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-90">Total de Respostas</p>
                <p className="text-4xl font-bold mt-2">{responses.length}</p>
              </div>
              <BarChart3 className="w-12 h-12 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Survey Responses Chart */}
      {template && (template.questionType === "single_choice" || template.questionType === "multiple_choice") && surveyData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Respostas da Pesquisa</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={surveyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} interval={0} style={{ fontSize: '12px' }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#40E0D0" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Rating Chart */}
      {template && template.questionType === "rating" && surveyData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Avaliações Médias</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={surveyData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, 5]} />
                <YAxis dataKey="name" type="category" width={150} style={{ fontSize: '12px' }} />
                <Tooltip />
                <Bar dataKey="rating" fill="#40E0D0" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Demographic Charts */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Dados Demográficos</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.keys(DEMOGRAPHIC_TITLES).map((field) => {
            const data = processData(field);
            return (
              <Card key={field}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{DEMOGRAPHIC_TITLES[field]}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={data}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percentage }) => `${name} (${percentage}%)`}
                        outerRadius={60}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {data.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 pt-2 border-t">
                    {data.map((entry, index) => (
                      <div key={index} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full flex-shrink-0" 
                            style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                          />
                          <span className="text-muted-foreground">{entry.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{entry.value}</span>
                          <span className="text-muted-foreground">({entry.percentage}%)</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Open Text Responses - Grouped */}
      {template && template.questionType === "open_text" && groupedResponses && groupedResponses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Respostas Abertas Agrupadas ({responses.length} total)</CardTitle>
            <CardDescription>Respostas similares agrupadas e contadas automaticamente</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {groupedResponses.map((item, idx) => (
                <div key={idx} className="border-l-4 border-[#40E0D0] pl-4 py-2 bg-muted/30 rounded-r">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm font-medium flex-1">{item.displayText}</p>
                    <Badge variant="outline" className="shrink-0">
                      {item.count} {item.count === 1 ? 'resposta' : 'respostas'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Open Text Responses - Fallback for ungrouped */}
      {template && template.questionType === "open_text" && (!groupedResponses || groupedResponses.length === 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Respostas Abertas ({responses.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {responses.map((r, idx) => (
                <div key={idx} className="border-l-4 border-[#40E0D0] pl-4 py-2 bg-muted/30 rounded-r">
                  <p className="text-sm">{r.responseData?.answer || "Sem resposta"}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
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
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());

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
    return `https://www.politicall.com.br/pesquisa/${slug}`;
  };

  const toggleResults = (campaignId: string) => {
    const newExpanded = new Set(expandedResults);
    if (newExpanded.has(campaignId)) {
      newExpanded.delete(campaignId);
    } else {
      newExpanded.add(campaignId);
    }
    setExpandedResults(newExpanded);
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

                    <Separator className="my-4" />

                    <Button
                      variant="outline"
                      className="w-full rounded-full"
                      onClick={() => toggleResults(campaign.id)}
                      data-testid={`button-toggle-results-${campaign.id}`}
                    >
                      <BarChart3 className="w-4 h-4 mr-2" />
                      {expandedResults.has(campaign.id) ? "Ocultar Resultados" : "Ver Resultados da Pesquisa"}
                      {expandedResults.has(campaign.id) ? <ChevronUp className="w-4 h-4 ml-2" /> : <ChevronDown className="w-4 h-4 ml-2" />}
                    </Button>

                    {expandedResults.has(campaign.id) && (
                      <SurveyResults campaignId={campaign.id} template={campaign.template} viewCount={campaign.viewCount || 0} />
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
