import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Users, Handshake, ClipboardList, Calendar, TrendingUp, TrendingDown, Target, AlertCircle, CheckCircle2, Award, Zap, Info, BarChart, UserRound, Cake } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart as RechartsBarChart, Bar, XAxis, YAxis, Tooltip, Legend } from "recharts";

interface DashboardStats {
  totalContacts: number;
  totalAlliances: number;
  totalDemands: number;
  pendingDemands: number;
  totalEvents: number;
  upcomingEvents: number;
  ideologyDistribution: { ideology: string; count: number }[];
  genderDistribution?: {
    counts: { 
      Masculino: number; 
      Feminino: number; 
      'Não-binário': number;
      Outro: number;
      'Prefiro não responder': number;
      Indefinido: number;
    };
    percentages: { 
      Masculino: number; 
      Feminino: number; 
      'Não-binário': number;
      Outro: number;
      'Prefiro não responder': number;
      Indefinido: number;
    };
    total: number;
  };
  averageAge?: number;
  ageSampleSize?: number;
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

  // Fetch current user for role checks
  const { data: currentUser, isLoading: userLoading } = useQuery<CurrentUser>({
    queryKey: ["/api/auth/me"],
  });

  // Fetch admin data for campaign goals (all users see admin's campaign metrics)
  const { data: adminData, isLoading: adminLoading } = useQuery<CurrentUser>({
    queryKey: ["/api/account/admin"],
  });

  const isLoading = statsLoading || userLoading || adminLoading;

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

  // Calcular metas baseadas no cargo político do ADMIN (todos veem as mesmas metas)
  const position = adminData?.politicalPosition || '';
  const baseGoals = POSITION_GOALS[position] || { voters: 5000, alliances: 10, description: 'Metas recomendadas para sua campanha' };
  
  // Ajustar metas baseadas na última eleição do ADMIN
  const lastElectionVotes = adminData?.lastElectionVotes || 0;
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
              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                {currentVoters >= lastElectionVotes ? (
                  <TrendingUp className="h-3 w-3 text-green-500" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-amber-500" />
                )}
                {growthPercentage}% vs última eleição
              </div>
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
              <span className="text-xs text-muted-foreground">
                {stats?.pendingDemands || 0} pendentes
              </span>
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
            <div className="text-xs text-muted-foreground mt-1">
              {stats?.upcomingEvents || 0} próximos
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Demografia dos Eleitores */}
      {stats?.genderDistribution && stats.genderDistribution.total > 0 && (
        <Card className="shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-xl">
              <UserRound className="h-5 w-5 text-primary" />
              Demografia dos Eleitores
            </CardTitle>
            <CardDescription>
              Distribuição por gênero e faixa etária
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Coluna Esquerda: Estatísticas */}
              <div className="space-y-6">
                {/* Estatísticas Principais */}
                <div className="space-y-4">
                  <div className="flex items-start gap-3 p-4 bg-muted/30 rounded-xl">
                    <Users className="h-5 w-5 text-primary mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground mb-1">Total de Eleitores</p>
                      <p className="text-3xl font-bold" data-testid="text-total-contacts">
                        {stats.genderDistribution.total.toLocaleString('pt-BR')}
                      </p>
                    </div>
                  </div>

                  {stats.averageAge !== undefined && stats.ageSampleSize && stats.ageSampleSize >= 3 && (
                    <div className="flex items-start gap-3 p-4 bg-muted/30 rounded-xl">
                      <Cake className="h-5 w-5 text-primary mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm text-muted-foreground mb-1">Idade Média</p>
                        <div className="flex items-baseline gap-2">
                          <p className="text-3xl font-bold" data-testid="text-average-age">
                            {stats.averageAge}
                          </p>
                          <span className="text-lg text-muted-foreground">anos</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Baseado em {stats.ageSampleSize.toLocaleString('pt-BR')} {stats.ageSampleSize === 1 ? 'eleitor' : 'eleitores'}
                        </p>
                      </div>
                    </div>
                  )}

                  {(!stats.averageAge || !stats.ageSampleSize || stats.ageSampleSize < 3) && (
                    <div className="flex items-start gap-3 p-4 bg-muted/30 rounded-xl border border-dashed">
                      <Info className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm text-muted-foreground mb-1">Idade Média</p>
                        <p className="text-sm text-muted-foreground">
                          Dados insuficientes para cálculo
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Cadastre a idade de pelo menos 3 eleitores
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Legenda do Gráfico */}
                <div className="space-y-3">
                  <p className="text-sm font-medium text-muted-foreground">Distribuição por Gênero</p>
                  <div className="space-y-2">
                    {stats.genderDistribution.counts.Masculino > 0 && (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-blue-500" />
                          <span className="text-sm">Masculino</span>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold">{stats.genderDistribution.percentages.Masculino.toFixed(1)}%</p>
                          <p className="text-xs text-muted-foreground">{stats.genderDistribution.counts.Masculino} {stats.genderDistribution.counts.Masculino === 1 ? 'eleitor' : 'eleitores'}</p>
                        </div>
                      </div>
                    )}
                    {stats.genderDistribution.counts.Feminino > 0 && (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-pink-500" />
                          <span className="text-sm">Feminino</span>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold">{stats.genderDistribution.percentages.Feminino.toFixed(1)}%</p>
                          <p className="text-xs text-muted-foreground">{stats.genderDistribution.counts.Feminino} {stats.genderDistribution.counts.Feminino === 1 ? 'eleitor' : 'eleitores'}</p>
                        </div>
                      </div>
                    )}
                    {stats.genderDistribution.counts['Não-binário'] > 0 && (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-purple-500" />
                          <span className="text-sm">Não-binário</span>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold">{stats.genderDistribution.percentages['Não-binário'].toFixed(1)}%</p>
                          <p className="text-xs text-muted-foreground">{stats.genderDistribution.counts['Não-binário']} {stats.genderDistribution.counts['Não-binário'] === 1 ? 'eleitor' : 'eleitores'}</p>
                        </div>
                      </div>
                    )}
                    {stats.genderDistribution.counts.Outro > 0 && (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-orange-500" />
                          <span className="text-sm">Outro</span>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold">{stats.genderDistribution.percentages.Outro.toFixed(1)}%</p>
                          <p className="text-xs text-muted-foreground">{stats.genderDistribution.counts.Outro} {stats.genderDistribution.counts.Outro === 1 ? 'eleitor' : 'eleitores'}</p>
                        </div>
                      </div>
                    )}
                    {stats.genderDistribution.counts['Prefiro não responder'] > 0 && (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-gray-400" />
                          <span className="text-sm">Prefiro não responder</span>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold">{stats.genderDistribution.percentages['Prefiro não responder'].toFixed(1)}%</p>
                          <p className="text-xs text-muted-foreground">{stats.genderDistribution.counts['Prefiro não responder']} {stats.genderDistribution.counts['Prefiro não responder'] === 1 ? 'eleitor' : 'eleitores'}</p>
                        </div>
                      </div>
                    )}
                    {stats.genderDistribution.counts.Indefinido > 0 && (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-slate-300" />
                          <span className="text-sm">Não identificado</span>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold">{stats.genderDistribution.percentages.Indefinido.toFixed(1)}%</p>
                          <p className="text-xs text-muted-foreground">{stats.genderDistribution.counts.Indefinido} {stats.genderDistribution.counts.Indefinido === 1 ? 'eleitor' : 'eleitores'}</p>
                        </div>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground italic mt-3">
                    Detecção automática quando gênero não informado
                  </p>
                </div>
              </div>

              {/* Coluna Direita: Gráfico Donut */}
              <div className="flex items-center justify-center">
                <div className="w-full max-w-sm">
                  <ResponsiveContainer width="100%" height={360}>
                    <PieChart>
                      <defs>
                        <linearGradient id="gradientMasculino" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.9} />
                          <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.8} />
                        </linearGradient>
                        <linearGradient id="gradientFeminino" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f472b6" stopOpacity={0.9} />
                          <stop offset="100%" stopColor="#ec4899" stopOpacity={0.8} />
                        </linearGradient>
                        <linearGradient id="gradientNaoBinario" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#c084fc" stopOpacity={0.9} />
                          <stop offset="100%" stopColor="#a855f7" stopOpacity={0.8} />
                        </linearGradient>
                        <linearGradient id="gradientOutro" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#fb923c" stopOpacity={0.9} />
                          <stop offset="100%" stopColor="#f97316" stopOpacity={0.8} />
                        </linearGradient>
                        <linearGradient id="gradientPreferirNaoResponder" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#9ca3af" stopOpacity={0.9} />
                          <stop offset="100%" stopColor="#6b7280" stopOpacity={0.8} />
                        </linearGradient>
                        <linearGradient id="gradientIndefinido" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#cbd5e1" stopOpacity={0.9} />
                          <stop offset="100%" stopColor="#94a3b8" stopOpacity={0.8} />
                        </linearGradient>
                      </defs>
                      <Pie
                        data={[
                          ...(stats.genderDistribution.counts.Masculino > 0 ? [{
                            name: 'Masculino',
                            value: stats.genderDistribution.counts.Masculino,
                            fill: 'url(#gradientMasculino)'
                          }] : []),
                          ...(stats.genderDistribution.counts.Feminino > 0 ? [{
                            name: 'Feminino',
                            value: stats.genderDistribution.counts.Feminino,
                            fill: 'url(#gradientFeminino)'
                          }] : []),
                          ...(stats.genderDistribution.counts['Não-binário'] > 0 ? [{
                            name: 'Não-binário',
                            value: stats.genderDistribution.counts['Não-binário'],
                            fill: 'url(#gradientNaoBinario)'
                          }] : []),
                          ...(stats.genderDistribution.counts.Outro > 0 ? [{
                            name: 'Outro',
                            value: stats.genderDistribution.counts.Outro,
                            fill: 'url(#gradientOutro)'
                          }] : []),
                          ...(stats.genderDistribution.counts['Prefiro não responder'] > 0 ? [{
                            name: 'Prefiro não responder',
                            value: stats.genderDistribution.counts['Prefiro não responder'],
                            fill: 'url(#gradientPreferirNaoResponder)'
                          }] : []),
                          ...(stats.genderDistribution.counts.Indefinido > 0 ? [{
                            name: 'Não identificado',
                            value: stats.genderDistribution.counts.Indefinido,
                            fill: 'url(#gradientIndefinido)'
                          }] : []),
                        ]}
                        cx="50%"
                        cy="50%"
                        innerRadius={80}
                        outerRadius={120}
                        paddingAngle={2}
                        dataKey="value"
                        animationBegin={0}
                        animationDuration={800}
                        animationEasing="ease-out"
                      >
                      </Pie>
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length && stats?.genderDistribution) {
                            const data = payload[0];
                            const percentage = ((data.value as number) / stats.genderDistribution.total * 100).toFixed(1);
                            return (
                              <div className="bg-background border rounded-lg shadow-lg p-3">
                                <p className="font-semibold text-sm">{data.name}</p>
                                <p className="text-sm text-muted-foreground">{data.value} {data.value === 1 ? 'eleitor' : 'eleitores'} ({percentage}%)</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="text-center -mt-8">
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="text-2xl font-bold">{stats.genderDistribution.total}</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
