import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Users, Handshake, ClipboardList, Calendar, TrendingUp, TrendingDown, Target, AlertCircle, CheckCircle2, Award, Zap, Info, BarChart } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart as RechartsBarChart, Bar, XAxis, YAxis, Tooltip, Legend } from "recharts";

interface DashboardStats {
  totalContacts: number;
  totalAlliances: number;
  totalDemands: number;
  pendingDemands: number;
  totalEvents: number;
  upcomingEvents: number;
  ideologyDistribution: { ideology: string; count: number }[];
}

interface CurrentUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatar?: string;
  partyId?: string;
  politicalPosition?: string;
  lastElectionVotes?: number;
  party?: {
    id: string;
    name: string;
    acronym: string;
    ideology: string;
  };
}

const COLORS = {
  'Esquerda': '#ef4444',
  'Centro-Esquerda': '#f97316', 
  'Centro': '#eab308',
  'Centro-Direita': '#3b82f6',
  'Direita': '#6366f1',
};

// Metas recomendadas por cargo político
const POSITION_GOALS: Record<string, { voters: number; alliances: number; description: string }> = {
  'Vereador': { voters: 1000, alliances: 5, description: 'Para uma campanha competitiva de vereador' },
  'Prefeito': { voters: 10000, alliances: 15, description: 'Para uma campanha sólida de prefeito' },
  'Vice-Prefeito': { voters: 8000, alliances: 12, description: 'Para apoiar campanha de prefeito' },
  'Deputado Estadual': { voters: 25000, alliances: 20, description: 'Para deputado estadual competitivo' },
  'Deputado Federal': { voters: 50000, alliances: 25, description: 'Para deputado federal forte' },
  'Senador': { voters: 500000, alliances: 40, description: 'Para campanha de senador' },
  'Governador': { voters: 1000000, alliances: 50, description: 'Para governador competitivo' },
  'Vice-Governador': { voters: 800000, alliances: 45, description: 'Para apoiar campanha de governador' },
  'Presidente': { voters: 5000000, alliances: 80, description: 'Para campanha presidencial' },
  'Vice-Presidente': { voters: 4000000, alliances: 70, description: 'Para apoiar campanha presidencial' },
};

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  const { data: currentUser, isLoading: userLoading } = useQuery<CurrentUser>({
    queryKey: ["/api/auth/me"],
  });

  const isLoading = statsLoading || userLoading;

  if (isLoading) {
    return (
      <div className="p-8 space-y-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-4 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Calcular metas baseadas no cargo político
  const position = currentUser?.politicalPosition || '';
  const baseGoals = POSITION_GOALS[position] || { voters: 5000, alliances: 10, description: 'Metas recomendadas para sua campanha' };
  
  // Ajustar metas baseadas na última eleição
  const lastElectionVotes = currentUser?.lastElectionVotes || 0;
  const voterGoal = lastElectionVotes > 0 
    ? Math.max(baseGoals.voters, Math.ceil(lastElectionVotes * 1.2)) // 20% acima da última eleição
    : baseGoals.voters;
  
  // Meta de alianças = 3% dos votos da última eleição
  const allianceGoal = lastElectionVotes > 0
    ? Math.ceil(lastElectionVotes * 0.03) // 3% dos votos da última eleição
    : baseGoals.alliances;
  
  const goals = {
    ...baseGoals,
    voters: voterGoal,
    alliances: allianceGoal,
    description: lastElectionVotes > 0 
      ? `Meta: superar os ${lastElectionVotes.toLocaleString('pt-BR')} votos da última eleição`
      : baseGoals.description
  };
  
  // Taxa de conversão média (percentual de eleitores cadastrados que efetivamente votam)
  // Baixo engajamento: 40%, Médio: 60%, Alto: 80%
  const CONVERSION_RATES = {
    low: 0.40,    // 40% dos cadastrados votam
    medium: 0.60, // 60% dos cadastrados votam  
    high: 0.80    // 80% dos cadastrados votam
  };

  // Calcular quantos eleitores precisam ser cadastrados considerando taxa de conversão
  const currentContacts = stats?.totalContacts || 0;
  
  // Projeção de votos com diferentes níveis de engajamento
  const projectedVotesLow = Math.floor(currentContacts * CONVERSION_RATES.low);
  const projectedVotesMedium = Math.floor(currentContacts * CONVERSION_RATES.medium);
  const projectedVotesHigh = Math.floor(currentContacts * CONVERSION_RATES.high);
  
  // Quantos eleitores precisam cadastrar para atingir a meta com cada nível de engajamento
  const neededContactsLow = Math.ceil(goals.voters / CONVERSION_RATES.low);
  const neededContactsMedium = Math.ceil(goals.voters / CONVERSION_RATES.medium);
  const neededContactsHigh = Math.ceil(goals.voters / CONVERSION_RATES.high);
  
  // Determinar nível de engajamento atual baseado em atividades
  const totalActivities = (stats?.totalEvents || 0) + (stats?.totalDemands || 0);
  const engagementLevel = totalActivities > 50 ? 'high' : totalActivities > 20 ? 'medium' : 'low';
  const currentConversionRate = CONVERSION_RATES[engagementLevel as keyof typeof CONVERSION_RATES];
  
  // Projeção realista de votos considerando engajamento atual
  const projectedVotes = Math.floor(currentContacts * currentConversionRate);
  const neededContacts = Math.ceil(goals.voters / currentConversionRate);
  
  const votersProgress = Math.min((currentContacts / neededContacts) * 100, 100);
  const alliancesProgress = Math.min((stats?.totalAlliances || 0) / goals.alliances * 100, 100);
  
  const votersGoalStatus = votersProgress >= 100 ? 'achieved' : votersProgress >= 50 ? 'on-track' : 'needs-attention';
  const alliancesGoalStatus = alliancesProgress >= 100 ? 'achieved' : alliancesProgress >= 50 ? 'on-track' : 'needs-attention';
  
  // Crescimento desde última eleição
  const currentVoters = stats?.totalContacts || 0;
  const growthPercentage = lastElectionVotes > 0 
    ? ((currentVoters - lastElectionVotes) / lastElectionVotes * 100).toFixed(1)
    : 0;

  

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6 md:space-y-8">
      {position && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold">Metas de Campanha</h2>
              <p className="text-muted-foreground mt-1">{goals.description}</p>
            </div>
            <Award className="h-8 w-8 text-primary/20" />
          </div>
          <div className="space-y-6">
            {/* Meta de Eleitores */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Eleitores</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold">{(stats?.totalContacts || 0).toLocaleString('pt-BR')}</span>
                  <span className="text-sm text-muted-foreground">/ {goals.voters.toLocaleString('pt-BR')}</span>
                  {votersGoalStatus === 'achieved' && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                </div>
              </div>
              <Progress value={votersProgress} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">
                {votersProgress.toFixed(0)}% da meta atingida
                {votersGoalStatus === 'needs-attention' && ` • Faltam ${(goals.voters - (stats?.totalContacts || 0)).toLocaleString('pt-BR')} eleitores`}
              </p>
            </div>

            {/* Meta de Alianças */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Handshake className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    Alianças Políticas
                    {stats?.ideologyDistribution && stats.ideologyDistribution.length > 0 && (() => {
                      const strongest = stats.ideologyDistribution.reduce((max, current) => 
                        current.count > max.count ? current : max
                      );
                      return ` | ${strongest.ideology}`;
                    })()}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold">{stats?.totalAlliances || 0}</span>
                  <span className="text-sm text-muted-foreground">/ {goals.alliances}</span>
                  {alliancesGoalStatus === 'achieved' && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                </div>
              </div>
              <Progress value={alliancesProgress} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">
                {alliancesProgress.toFixed(0)}% da meta atingida
                {alliancesGoalStatus === 'needs-attention' && ` • Faltam ${goals.alliances - (stats?.totalAlliances || 0)} alianças`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Métricas Principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Eleitores Cadastrados */}
        <Card data-testid="metric-contacts">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Eleitores Cadastrados
            </CardTitle>
            <Users className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{(stats?.totalContacts || 0).toLocaleString('pt-BR')}</div>
            {lastElectionVotes > 0 && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                {currentVoters >= lastElectionVotes ? (
                  <TrendingUp className="h-3 w-3 text-green-500" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-amber-500" />
                )}
                {growthPercentage}% vs última eleição
              </p>
            )}
          </CardContent>
        </Card>

        {/* Alianças Políticas */}
        <Card data-testid="metric-alliances">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Alianças Políticas
            </CardTitle>
            <Handshake className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.totalAlliances || 0}</div>
            {position && (
              <p className="text-xs text-muted-foreground mt-1">
                Meta: {goals.alliances} alianças
              </p>
            )}
          </CardContent>
        </Card>

        {/* Demandas */}
        <Card data-testid="metric-demands">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Demandas Ativas
            </CardTitle>
            <ClipboardList className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.totalDemands || 0}</div>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={(stats?.pendingDemands || 0) > 10 ? "destructive" : "secondary"} className="text-xs">
                {stats?.pendingDemands || 0} pendentes
              </Badge>
              {(stats?.pendingDemands || 0) > 10 && (
                <Zap className="h-3 w-3 text-amber-500" />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Eventos */}
        <Card data-testid="metric-events">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Eventos Agendados
            </CardTitle>
            <Calendar className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.totalEvents || 0}</div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Badge variant="outline" className="text-xs">
                {stats?.upcomingEvents || 0} próximos
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos de Pesquisas Mercadológicas */}
      <SurveyCampaignsCharts />
    </div>
  );
}

function SurveyCampaignsCharts() {
  const { data: campaigns } = useQuery<any[]>({
    queryKey: ["/api/survey-campaigns"],
  });

  if (!campaigns || campaigns.length === 0) {
    return null;
  }

  // Filtrar apenas pesquisas aprovadas
  const approvedCampaigns = campaigns.filter(c => c.status === 'approved' || c.status === 'active');

  if (approvedCampaigns.length === 0) {
    return null;
  }

  // Preparar dados para gráficos
  const campaignsByStatus = [
    { status: 'Aprovadas', count: campaigns.filter(c => c.status === 'approved' || c.status === 'active').length },
    { status: 'Em Análise', count: campaigns.filter(c => c.status === 'under_review').length },
    { status: 'Rejeitadas', count: campaigns.filter(c => c.status === 'rejected').length },
  ].filter(item => item.count > 0);

  const campaignsByResponses = approvedCampaigns
    .map(c => ({
      name: c.campaignName.replace('Pesquisa: ', '').substring(0, 30) + (c.campaignName.length > 30 ? '...' : ''),
      responses: c.responseCount || 0,
    }))
    .sort((a, b) => b.responses - a.responses)
    .slice(0, 5);

  const totalResponses = approvedCampaigns.reduce((sum, c) => sum + (c.responseCount || 0), 0);

  const STATUS_COLORS = {
    'Aprovadas': '#40E0D0',
    'Em Análise': '#fbbf24',
    'Rejeitadas': '#ef4444',
  };

  return (
    <div className="space-y-6">
      {/* Resumo de Pesquisas */}
      <Card className="border-[#40E0D0]/20">
        <CardHeader>
          <CardTitle>
            Pesquisas Mercadológicas
          </CardTitle>
          <CardDescription>Visão geral das suas pesquisas encomendadas</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-[#40E0D0]">{approvedCampaigns.length}</div>
              <div className="text-sm text-muted-foreground mt-1">Pesquisas Ativas</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold">{totalResponses.toLocaleString('pt-BR')}</div>
              <div className="text-sm text-muted-foreground mt-1">Respostas Coletadas</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold">{campaigns.length}</div>
              <div className="text-sm text-muted-foreground mt-1">Total de Campanhas</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status das Campanhas */}
        <Card>
          <CardHeader>
            <CardTitle>Status das Campanhas</CardTitle>
            <CardDescription>Distribuição por status de aprovação</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={campaignsByStatus}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ status, percent }) => `${status}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="count"
                  nameKey="status"
                >
                  {campaignsByStatus.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.status as keyof typeof STATUS_COLORS] || '#94a3b8'} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Respostas por Pesquisa */}
        <Card>
          <CardHeader>
            <CardTitle>Respostas por Pesquisa</CardTitle>
            <CardDescription>Top 5 pesquisas com mais participação</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <RechartsBarChart data={campaignsByResponses} layout="horizontal">
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={150} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="responses" fill="#40E0D0" name="Respostas" />
              </RechartsBarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
