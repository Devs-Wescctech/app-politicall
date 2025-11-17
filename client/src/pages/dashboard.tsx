import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Handshake, ClipboardList, Calendar, TrendingUp, TrendingDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
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

const COLORS = {
  'Esquerda': '#ef4444',
  'Centro-Esquerda': '#f97316', 
  'Centro': '#eab308',
  'Centro-Direita': '#3b82f6',
  'Direita': '#6366f1',
};

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  if (isLoading) {
    return (
      <div className="p-8 space-y-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-8 rounded-md" />
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

  const metricCards = [
    {
      title: "Eleitores",
      value: stats?.totalContacts || 0,
      icon: Users,
      trend: null,
      testId: "metric-contacts"
    },
    {
      title: "Alianças Políticas",
      value: stats?.totalAlliances || 0,
      icon: Handshake,
      trend: null,
      testId: "metric-alliances"
    },
    {
      title: "Demandas",
      value: stats?.totalDemands || 0,
      subtitle: `${stats?.pendingDemands || 0} pendentes`,
      icon: ClipboardList,
      trend: stats?.pendingDemands ? "down" : "up",
      testId: "metric-demands"
    },
    {
      title: "Eventos",
      value: stats?.totalEvents || 0,
      subtitle: `${stats?.upcomingEvents || 0} próximos`,
      icon: Calendar,
      trend: null,
      testId: "metric-events"
    },
  ];

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6 md:space-y-8">
      <div>
        <h1 className="text-3xl font-bold" data-testid="heading-dashboard">Dashboard</h1>
        <p className="text-muted-foreground mt-2">Visão geral da sua gestão política</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {metricCards.map((metric) => (
          <Card key={metric.title} data-testid={metric.testId}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {metric.title}
              </CardTitle>
              <metric.icon className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{metric.value}</div>
              {metric.subtitle && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  {metric.trend === "up" && <TrendingUp className="h-3 w-3 text-green-500" />}
                  {metric.trend === "down" && <TrendingDown className="h-3 w-3 text-amber-500" />}
                  {metric.subtitle}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {stats?.ideologyDistribution && stats.ideologyDistribution.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Distribuição Ideológica das Alianças</CardTitle>
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
