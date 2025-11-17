import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Users, Handshake, ClipboardList, Calendar, TrendingUp, TrendingDown, Target, AlertCircle, CheckCircle2, Award, Zap, Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from "recharts";

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
  const goals = POSITION_GOALS[position] || { voters: 5000, alliances: 10, description: 'Metas recomendadas para sua campanha' };
  
  const votersProgress = Math.min((stats?.totalContacts || 0) / goals.voters * 100, 100);
  const alliancesProgress = Math.min((stats?.totalAlliances || 0) / goals.alliances * 100, 100);
  
  const votersGoalStatus = votersProgress >= 100 ? 'achieved' : votersProgress >= 50 ? 'on-track' : 'needs-attention';
  const alliancesGoalStatus = alliancesProgress >= 100 ? 'achieved' : alliancesProgress >= 50 ? 'on-track' : 'needs-attention';
  
  // Crescimento desde última eleição
  const lastElectionVotes = currentUser?.lastElectionVotes || 0;
  const currentVoters = stats?.totalContacts || 0;
  const growthPercentage = lastElectionVotes > 0 
    ? ((currentVoters - lastElectionVotes) / lastElectionVotes * 100).toFixed(1)
    : 0;

  // Insights e recomendações
  const insights: { type: 'success' | 'warning' | 'info'; message: string }[] = [];
  
  if (votersGoalStatus === 'achieved') {
    insights.push({ type: 'success', message: `Parabéns! Você atingiu sua meta de eleitores para ${position || 'sua campanha'}!` });
  } else if (votersGoalStatus === 'needs-attention') {
    insights.push({ type: 'warning', message: `Você precisa cadastrar mais ${goals.voters - currentVoters} eleitores para atingir sua meta.` });
  }
  
  if (alliancesGoalStatus === 'achieved') {
    insights.push({ type: 'success', message: 'Sua rede de alianças está sólida!' });
  } else if (alliancesGoalStatus === 'needs-attention') {
    insights.push({ type: 'warning', message: `Busque mais ${goals.alliances - (stats?.totalAlliances || 0)} alianças políticas estratégicas.` });
  }
  
  if ((stats?.pendingDemands || 0) > 10) {
    insights.push({ type: 'warning', message: `Atenção! Você tem ${stats?.pendingDemands} demandas pendentes que precisam de ação.` });
  }
  
  if ((stats?.upcomingEvents || 0) > 0) {
    insights.push({ type: 'info', message: `Você tem ${stats?.upcomingEvents} eventos próximos agendados.` });
  }

  if (lastElectionVotes > 0 && currentVoters > lastElectionVotes) {
    insights.push({ type: 'success', message: `Crescimento de ${growthPercentage}% em relação à última eleição (${lastElectionVotes.toLocaleString('pt-BR')} votos)!` });
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6 md:space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold" data-testid="heading-dashboard">Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          {position ? `Gestão de campanha para ${position}` : 'Visão geral da sua gestão política'}
        </p>
      </div>

      {/* Alertas e Insights */}
      {insights.length > 0 && (
        <div className="space-y-3">
          {insights.map((insight, index) => (
            <Alert key={index} variant={insight.type === 'warning' ? 'destructive' : 'default'}>
              {insight.type === 'success' && <CheckCircle2 className="h-4 w-4" />}
              {insight.type === 'warning' && <AlertCircle className="h-4 w-4" />}
              {insight.type === 'info' && <Info className="h-4 w-4" />}
              <AlertDescription>{insight.message}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* Metas de Campanha */}
      {position && (
        <Card className="border-primary/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-primary" />
                  Metas de Campanha
                </CardTitle>
                <CardDescription className="mt-1">{goals.description}</CardDescription>
              </div>
              <Award className="h-8 w-8 text-primary/20" />
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
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
                  <span className="text-sm font-medium">Alianças Políticas</span>
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
          </CardContent>
        </Card>
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
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Badge variant="outline" className="text-xs">
                {stats?.upcomingEvents || 0} próximos
              </Badge>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos de Distribuição Ideológica */}
      {stats?.ideologyDistribution && stats.ideologyDistribution.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Distribuição Ideológica das Alianças</CardTitle>
              <CardDescription>Diversidade política da sua base de alianças</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie
                    data={stats.ideologyDistribution}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ ideology, percent }) => `${ideology}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="count"
                    nameKey="ideology"
                  >
                    {stats.ideologyDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[entry.ideology as keyof typeof COLORS] || '#94a3b8'} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Alianças por Ideologia</CardTitle>
              <CardDescription>Quantidade de alianças em cada espectro político</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={stats.ideologyDistribution}>
                  <XAxis dataKey="ideology" tick={{ fontSize: 12 }} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="count" fill="hsl(var(--primary))" name="Quantidade" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
