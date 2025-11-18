import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  TrendingUp, 
  Sparkles, 
  Target, 
  Users2, 
  Award, 
  AlertCircle,
  BarChart3,
  Lightbulb,
  CheckCircle2,
  ArrowRight,
  XCircle
} from "lucide-react";
import { insertCandidateProfileSchema, type CandidateProfile } from "@shared/schema";
import { BRAZILIAN_STATES_CITIES } from "@shared/brazilian-locations";
import { POLITICAL_POSITIONS } from "@shared/schema";

const BRAZILIAN_STATES = Object.entries(BRAZILIAN_STATES_CITIES).map(([abbr, data]) => ({
  abbr,
  name: data.name
}));
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const IDEOLOGIES = [
  "Esquerda",
  "Centro-Esquerda",
  "Centro",
  "Centro-Direita",
  "Direita"
] as const;

const profileFormSchema = z.object({
  fullName: z.string().min(3, "Nome completo é obrigatório"),
  politicalPartyId: z.string().optional(),
  targetPosition: z.string().min(1, "Cargo pretendido é obrigatório"),
  targetState: z.string().min(2, "Estado é obrigatório"),
  targetCity: z.string().optional(),
  electionYear: z.number().min(2024).max(2050, "Ano da eleição inválido"),
  ideology: z.string().optional(),
  mainValues: z.string().optional(),
  keyProposals: z.string().optional(),
  politicalAlliances: z.string().optional(),
  campaignBudget: z.string().optional(),
  mainIssues: z.string().optional(),
  targetVoterProfile: z.string().optional(),
  strengths: z.string().optional(),
  weaknesses: z.string().optional(),
  previousExperience: z.string().optional(),
  achievements: z.string().optional(),
  publicRecognition: z.string().optional(),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

type AnalysisData = {
  comparison: {
    similarities: string[];
    differences: string[];
    successFactors: string[];
  };
  insights: {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
  };
  recommendations: {
    strategic: string[];
    campaign: string[];
    communication: string[];
    alliances: string[];
    budget: string[];
  };
  winProbabilityFactors: {
    favorable: string[];
    unfavorable: string[];
    estimated_score: string;
  };
};

type StatisticsAnalysis = {
  id: string;
  userId: string;
  candidateProfileId: string;
  analysisData: AnalysisData;
  createdAt: Date;
};

export default function Statistics() {
  const { toast } = useToast();
  const [showAnalysis, setShowAnalysis] = useState(false);

  const { data: profile, isLoading: profileLoading } = useQuery<CandidateProfile | null>({
    queryKey: ["/api/statistics/profile"],
  });

  const { data: latestAnalysis, isLoading: analysisLoading } = useQuery<StatisticsAnalysis | null>({
    queryKey: ["/api/statistics/analysis/latest"],
    enabled: showAnalysis,
  });

  const { data: parties } = useQuery<Array<{ id: string; name: string; acronym: string }>>({
    queryKey: ["/api/political-parties"],
  });

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      fullName: "",
      politicalPartyId: undefined,
      targetPosition: "",
      targetState: "",
      targetCity: "",
      electionYear: new Date().getFullYear() + 1,
      ideology: "",
      mainValues: "",
      keyProposals: "",
      politicalAlliances: "",
      campaignBudget: "",
      mainIssues: "",
      targetVoterProfile: "",
      strengths: "",
      weaknesses: "",
      previousExperience: "",
      achievements: "",
      publicRecognition: "",
    },
  });

  // Update form when profile loads
  useEffect(() => {
    if (profile) {
      form.reset({
        fullName: profile.fullName || "",
        politicalPartyId: profile.politicalPartyId || undefined,
        targetPosition: profile.targetPosition || "",
        targetState: profile.targetState || "",
        targetCity: profile.targetCity || "",
        electionYear: profile.electionYear || new Date().getFullYear() + 1,
        ideology: profile.ideology || "",
        mainValues: profile.mainValues?.join(", ") || "",
        keyProposals: profile.keyProposals?.join(", ") || "",
        politicalAlliances: profile.politicalAlliances?.join(", ") || "",
        campaignBudget: profile.campaignBudget?.toString() || "",
        mainIssues: profile.mainIssues?.join(", ") || "",
        targetVoterProfile: profile.targetVoterProfile || "",
        strengths: profile.strengths?.join(", ") || "",
        weaknesses: profile.weaknesses?.join(", ") || "",
        previousExperience: profile.previousExperience || "",
        achievements: profile.achievements?.join(", ") || "",
        publicRecognition: profile.publicRecognition || "",
      });
    }
  }, [profile, form]);

  const saveMutation = useMutation({
    mutationFn: async (data: ProfileFormValues) => {
      const formattedData = {
        ...data,
        campaignBudget: data.campaignBudget ? parseFloat(data.campaignBudget as string) : undefined,
        mainValues: data.mainValues ? data.mainValues.split(",").map(v => v.trim()).filter(Boolean) : [],
        keyProposals: data.keyProposals ? data.keyProposals.split(",").map(v => v.trim()).filter(Boolean) : [],
        politicalAlliances: data.politicalAlliances ? data.politicalAlliances.split(",").map(v => v.trim()).filter(Boolean) : [],
        mainIssues: data.mainIssues ? data.mainIssues.split(",").map(v => v.trim()).filter(Boolean) : [],
        strengths: data.strengths ? data.strengths.split(",").map(v => v.trim()).filter(Boolean) : [],
        weaknesses: data.weaknesses ? data.weaknesses.split(",").map(v => v.trim()).filter(Boolean) : [],
        achievements: data.achievements ? data.achievements.split(",").map(v => v.trim()).filter(Boolean) : [],
      };
      
      const method = profile ? "PUT" : "POST";
      return apiRequest(method, "/api/statistics/profile", formattedData);
    },
    onSuccess: () => {
      toast({
        title: "Perfil salvo!",
        description: "Seu perfil de candidato foi salvo com sucesso.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/statistics/profile"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/statistics/analyze", {});
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Análise gerada!",
        description: "Sua análise comparativa foi gerada com sucesso.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/statistics/analysis/latest"] });
      setShowAnalysis(true);
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao gerar análise",
        description: error.message || "Não foi possível gerar a análise. Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ProfileFormValues) => {
    saveMutation.mutate(data);
  };

  if (profileLoading) {
    return (
      <div className="container mx-auto py-8 px-4 space-y-6">
        <Skeleton className="h-12 w-64" />
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-full mt-2" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 space-y-8">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <TrendingUp className="w-8 h-8 text-[#40E0D0]" />
          <h1 className="text-3xl font-bold" data-testid="text-page-title">
            Estatísticas e Análise Competitiva
          </h1>
        </div>
        <p className="text-muted-foreground">
          Analise sua candidatura comparando com candidatos eleitos anteriormente usando inteligência artificial
        </p>
      </div>

      {!profile && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Complete seu perfil</AlertTitle>
          <AlertDescription>
            Para gerar análises estatísticas e recomendações estratégicas, primeiro complete as informações sobre sua candidatura.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5 text-[#40E0D0]" />
            Perfil do Candidato
          </CardTitle>
          <CardDescription>
            Preencha seus dados para que a IA possa gerar análises comparativas precisas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome Completo</FormLabel>
                      <FormControl>
                        <Input placeholder="Seu nome completo" {...field} data-testid="input-fullname" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="politicalPartyId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Partido Político</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ""}>
                        <FormControl>
                          <SelectTrigger data-testid="select-party">
                            <SelectValue placeholder="Selecione seu partido" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {parties?.map((party) => (
                            <SelectItem key={party.id} value={party.id}>
                              {party.acronym} - {party.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="targetPosition"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cargo Pretendido</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-position">
                            <SelectValue placeholder="Selecione o cargo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {POLITICAL_POSITIONS.filter(p => !["Candidato", "Pré-Candidato", "Outro"].includes(p)).map((position) => (
                            <SelectItem key={position} value={position}>
                              {position}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="electionYear"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ano da Eleição</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="2026" 
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value))}
                          data-testid="input-year"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="targetState"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Estado</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-state">
                            <SelectValue placeholder="Selecione o estado" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {BRAZILIAN_STATES.map((state) => (
                            <SelectItem key={state.abbr} value={state.abbr}>
                              {state.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="targetCity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cidade (opcional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Digite a cidade" {...field} data-testid="input-city" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="ideology"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ideologia Política (opcional)</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ""}>
                        <FormControl>
                          <SelectTrigger data-testid="select-ideology">
                            <SelectValue placeholder="Selecione sua ideologia" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {IDEOLOGIES.map((ideology) => (
                            <SelectItem key={ideology} value={ideology}>
                              {ideology}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Award className="w-5 h-5 text-[#40E0D0]" />
                  Perfil Político
                </h3>

                <FormField
                  control={form.control}
                  name="mainValues"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valores Principais (opcional)</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Ex: Transparência, Justiça Social, Educação (separados por vírgula)" 
                          {...field} 
                          data-testid="input-values"
                        />
                      </FormControl>
                      <FormDescription>Separe múltiplos valores por vírgula</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="keyProposals"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Principais Propostas (opcional)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Ex: Melhorar transporte público, Construir creches, Incentivar empresas locais" 
                          {...field}
                          rows={3}
                          data-testid="textarea-proposals"
                        />
                      </FormControl>
                      <FormDescription>Separe múltiplas propostas por vírgula</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="politicalAlliances"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Alianças Políticas (opcional)</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Ex: PT, PSDB, MDB (separados por vírgula)" 
                          {...field}
                          data-testid="input-alliances"
                        />
                      </FormControl>
                      <FormDescription>Partidos e coligações aliadas</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="mainIssues"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Temas Prioritários (opcional)</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Ex: Saúde, Segurança, Educação (separados por vírgula)" 
                          {...field}
                          data-testid="input-issues"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Users2 className="w-5 h-5 text-[#40E0D0]" />
                  Estratégia de Campanha
                </h3>

                <FormField
                  control={form.control}
                  name="targetVoterProfile"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Perfil do Eleitor-Alvo (opcional)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Ex: Classe média, jovens profissionais, moradores da periferia" 
                          {...field}
                          rows={2}
                          data-testid="textarea-voter-profile"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="strengths"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Pontos Fortes (opcional)</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Ex: Experiência administrativa, Comunicação eficaz" 
                            {...field}
                            rows={3}
                            data-testid="textarea-strengths"
                          />
                        </FormControl>
                        <FormDescription>Separe por vírgula</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="weaknesses"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Pontos Fracos (opcional)</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Ex: Baixo reconhecimento público, Orçamento limitado" 
                            {...field}
                            rows={3}
                            data-testid="textarea-weaknesses"
                          />
                        </FormControl>
                        <FormDescription>Separe por vírgula</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="previousExperience"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Experiência Política Anterior (opcional)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Descreva sua experiência em cargos públicos ou atividades políticas" 
                          {...field}
                          rows={3}
                          data-testid="textarea-experience"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="achievements"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Realizações (opcional)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Ex: Criou programa social X, Implementou projeto Y" 
                          {...field}
                          rows={3}
                          data-testid="textarea-achievements"
                        />
                      </FormControl>
                      <FormDescription>Separe por vírgula</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex gap-4">
                <Button 
                  type="submit" 
                  disabled={saveMutation.isPending}
                  data-testid="button-save-profile"
                  className="bg-[#40E0D0] hover:bg-[#48D1CC] text-white"
                >
                  {saveMutation.isPending ? "Salvando..." : "Salvar Perfil"}
                </Button>
                
                {profile && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => analyzeMutation.mutate()}
                    disabled={analyzeMutation.isPending}
                    data-testid="button-generate-analysis"
                  >
                    {analyzeMutation.isPending ? (
                      <>Gerando...</>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Gerar Análise com IA
                      </>
                    )}
                  </Button>
                )}
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {showAnalysis && profile && (
        <div className="space-y-6">
          {analysisLoading ? (
            <Card>
              <CardHeader>
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-4 w-full mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-32 w-full" />
              </CardContent>
            </Card>
          ) : latestAnalysis && latestAnalysis.analysisData ? (
            <>
              {/* Win Probability Score */}
              <Card className="border-[#40E0D0] bg-gradient-to-br from-[#40E0D0]/5 to-transparent">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="w-5 h-5 text-[#40E0D0]" />
                    Pontuação de Viabilidade Eleitoral
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center">
                    <div className="text-6xl font-bold text-[#40E0D0] mb-2">
                      {latestAnalysis.analysisData.winProbabilityFactors.estimated_score}
                    </div>
                    <p className="text-muted-foreground">de 100 pontos</p>
                  </div>
                </CardContent>
              </Card>

              {/* Comparison with Elected Candidates */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-[#40E0D0]" />
                    Comparação com Candidatos Eleitos
                  </CardTitle>
                  <CardDescription>
                    Análise comparativa baseada em dados históricos
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <h4 className="font-semibold text-sm mb-3 text-green-700 dark:text-green-400">Semelhanças</h4>
                    <ul className="space-y-2">
                      {latestAnalysis.analysisData.comparison.similarities.map((item, i) => (
                        <li key={i} className="flex gap-2 text-sm">
                          <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold text-sm mb-3 text-orange-700 dark:text-orange-400">Diferenças</h4>
                    <ul className="space-y-2">
                      {latestAnalysis.analysisData.comparison.differences.map((item, i) => (
                        <li key={i} className="flex gap-2 text-sm">
                          <AlertCircle className="w-4 h-4 text-orange-600 flex-shrink-0 mt-0.5" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold text-sm mb-3 text-[#40E0D0]">Fatores de Sucesso Identificados</h4>
                    <ul className="space-y-2">
                      {latestAnalysis.analysisData.comparison.successFactors.map((item, i) => (
                        <li key={i} className="flex gap-2 text-sm">
                          <Lightbulb className="w-4 h-4 text-[#40E0D0] flex-shrink-0 mt-0.5" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>

              {/* SWOT Analysis */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-[#40E0D0]" />
                    Análise SWOT
                  </CardTitle>
                  <CardDescription>
                    Forças, Fraquezas, Oportunidades e Ameaças
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold text-sm mb-3 text-green-700 dark:text-green-400">Pontos Fortes</h4>
                    <ul className="space-y-2">
                      {latestAnalysis.analysisData.insights.strengths.map((item, i) => (
                        <li key={i} className="flex gap-2 text-sm">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-600 flex-shrink-0 mt-1.5" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold text-sm mb-3 text-red-700 dark:text-red-400">Pontos Fracos</h4>
                    <ul className="space-y-2">
                      {latestAnalysis.analysisData.insights.weaknesses.map((item, i) => (
                        <li key={i} className="flex gap-2 text-sm">
                          <div className="w-1.5 h-1.5 rounded-full bg-red-600 flex-shrink-0 mt-1.5" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold text-sm mb-3 text-blue-700 dark:text-blue-400">Oportunidades</h4>
                    <ul className="space-y-2">
                      {latestAnalysis.analysisData.insights.opportunities.map((item, i) => (
                        <li key={i} className="flex gap-2 text-sm">
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-600 flex-shrink-0 mt-1.5" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold text-sm mb-3 text-orange-700 dark:text-orange-400">Ameaças</h4>
                    <ul className="space-y-2">
                      {latestAnalysis.analysisData.insights.threats.map((item, i) => (
                        <li key={i} className="flex gap-2 text-sm">
                          <div className="w-1.5 h-1.5 rounded-full bg-orange-600 flex-shrink-0 mt-1.5" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>

              {/* Strategic Recommendations */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Lightbulb className="w-5 h-5 text-[#40E0D0]" />
                    Recomendações Estratégicas
                  </CardTitle>
                  <CardDescription>
                    Ações recomendadas com base na análise
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {latestAnalysis.analysisData.recommendations.strategic.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-sm mb-3">Estratégia Geral</h4>
                      <ul className="space-y-2">
                        {latestAnalysis.analysisData.recommendations.strategic.map((item, i) => (
                          <li key={i} className="flex gap-2 text-sm">
                            <ArrowRight className="w-4 h-4 text-[#40E0D0] flex-shrink-0 mt-0.5" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {latestAnalysis.analysisData.recommendations.campaign.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-sm mb-3">Campanha</h4>
                      <ul className="space-y-2">
                        {latestAnalysis.analysisData.recommendations.campaign.map((item, i) => (
                          <li key={i} className="flex gap-2 text-sm">
                            <ArrowRight className="w-4 h-4 text-[#40E0D0] flex-shrink-0 mt-0.5" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {latestAnalysis.analysisData.recommendations.communication.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-sm mb-3">Comunicação</h4>
                      <ul className="space-y-2">
                        {latestAnalysis.analysisData.recommendations.communication.map((item, i) => (
                          <li key={i} className="flex gap-2 text-sm">
                            <ArrowRight className="w-4 h-4 text-[#40E0D0] flex-shrink-0 mt-0.5" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {latestAnalysis.analysisData.recommendations.alliances.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-sm mb-3">Alianças e Parcerias</h4>
                      <ul className="space-y-2">
                        {latestAnalysis.analysisData.recommendations.alliances.map((item, i) => (
                          <li key={i} className="flex gap-2 text-sm">
                            <ArrowRight className="w-4 h-4 text-[#40E0D0] flex-shrink-0 mt-0.5" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {latestAnalysis.analysisData.recommendations.budget.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-sm mb-3">Orçamento</h4>
                      <ul className="space-y-2">
                        {latestAnalysis.analysisData.recommendations.budget.map((item, i) => (
                          <li key={i} className="flex gap-2 text-sm">
                            <ArrowRight className="w-4 h-4 text-[#40E0D0] flex-shrink-0 mt-0.5" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Win Probability Factors */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="w-5 h-5 text-[#40E0D0]" />
                    Fatores de Probabilidade de Vitória
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold text-sm mb-3 text-green-700 dark:text-green-400">Fatores Favoráveis</h4>
                    <ul className="space-y-2">
                      {latestAnalysis.analysisData.winProbabilityFactors.favorable.map((item, i) => (
                        <li key={i} className="flex gap-2 text-sm">
                          <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold text-sm mb-3 text-red-700 dark:text-red-400">Fatores Desfavoráveis</h4>
                    <ul className="space-y-2">
                      {latestAnalysis.analysisData.winProbabilityFactors.unfavorable.map((item, i) => (
                        <li key={i} className="flex gap-2 text-sm">
                          <XCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Nenhuma análise encontrada</CardTitle>
                <CardDescription>
                  Clique em "Gerar Análise com IA" para criar uma nova análise
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
