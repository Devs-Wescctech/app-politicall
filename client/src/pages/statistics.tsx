import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Sparkles, 
  Target, 
  AlertCircle,
  BarChart3,
  Lightbulb,
  CheckCircle2,
  ArrowRight,
  XCircle,
  TrendingUp,
  User,
  Settings
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Link } from "wouter";

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
  analysisData: AnalysisData;
  createdAt: Date;
};

export default function Statistics() {
  const { toast } = useToast();
  const [showAnalysis, setShowAnalysis] = useState(false);

  const { data: currentUser, isLoading: userLoading } = useQuery<{
    id: string;
    name: string;
    email: string;
    phone?: string;
    partyId?: string;
    politicalPosition?: string;
    lastElectionVotes?: number;
    state?: string;
    city?: string;
  }>({
    queryKey: ["/api/auth/me"],
  });

  const { data: latestAnalysis, isLoading: analysisLoading } = useQuery<StatisticsAnalysis | null>({
    queryKey: ["/api/statistics/analysis/latest"],
    enabled: showAnalysis,
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

  const hasProfileData = currentUser?.politicalPosition || currentUser?.state;

  if (userLoading) {
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

      {!hasProfileData && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>
              Complete suas informações políticas em Configurações para gerar análises estatísticas e recomendações estratégicas.
            </span>
            <Link href="/settings">
              <Button variant="outline" size="sm" className="ml-4">
                <Settings className="w-4 h-4 mr-2" />
                Ir para Configurações
              </Button>
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5 text-[#40E0D0]" />
            Seu Perfil Político
          </CardTitle>
          <CardDescription>
            Dados utilizados para a análise comparativa (configurados em Configurações)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Nome</p>
              <p className="font-medium">{currentUser?.name || "Não informado"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Cargo Político</p>
              <p className="font-medium">{currentUser?.politicalPosition || "Não informado"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Estado</p>
              <p className="font-medium">{currentUser?.state || "Não informado"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Cidade</p>
              <p className="font-medium">{currentUser?.city || "Não informado"}</p>
            </div>
            {currentUser?.lastElectionVotes && (
              <div>
                <p className="text-sm text-muted-foreground">Votos na Última Eleição</p>
                <p className="font-medium">{currentUser.lastElectionVotes.toLocaleString('pt-BR')}</p>
              </div>
            )}
          </div>

          <div className="flex gap-4 pt-4">
            <Button
              onClick={() => analyzeMutation.mutate()}
              disabled={analyzeMutation.isPending || !hasProfileData}
              data-testid="button-generate-analysis"
              className="bg-[#40E0D0] hover:bg-[#48D1CC] text-white"
            >
              {analyzeMutation.isPending ? (
                <>Gerando análise...</>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Gerar Análise com IA
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {showAnalysis && (
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
