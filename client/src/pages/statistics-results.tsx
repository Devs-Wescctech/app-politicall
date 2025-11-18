import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { ArrowLeft, Download, Trophy } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

const COLORS = ['#40E0D0', '#48D1CC', '#20B2AA', '#5F9EA0', '#008B8B'];

export default function StatisticsResults() {
  const [selectedYear, setSelectedYear] = useState("2024");
  const [selectedRound, setSelectedRound] = useState("1");
  const [selectedPosition, setSelectedPosition] = useState("presidente");
  const [selectedState, setSelectedState] = useState("");

  const { data: yearsData } = useQuery<{ years: number[] }>({
    queryKey: ["/api/tse/available-years"],
  });

  const { data: positionsData } = useQuery<{ positions: Array<{ value: string; label: string }> }>({
    queryKey: ["/api/tse/positions"],
  });

  const { data: statesData } = useQuery<{ states: Array<{ value: string; label: string }> }>({
    queryKey: ["/api/tse/states"],
  });

  const { data: results, isLoading } = useQuery<any>({
    queryKey: ["/api/tse/results", selectedYear, selectedRound, selectedPosition, selectedState],
    enabled: !!selectedYear && !!selectedPosition,
  });

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('pt-BR').format(num);
  };

  const chartData = results?.candidates?.map((candidate: any) => ({
    name: candidate.name,
    Votos: candidate.votes,
    Percentual: candidate.percentage,
  })) || [];

  const pieData = results?.candidates?.map((candidate: any) => ({
    name: `${candidate.name} (${candidate.party})`,
    value: candidate.votes,
  })) || [];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/statistics">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-foreground" data-testid="heading-results">
            Resultados de Eleições
          </h1>
          <p className="text-muted-foreground">
            Consulte resultados oficiais das eleições por ano, cargo e localidade
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>Selecione os parâmetros para consulta</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Ano</label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="rounded-full" data-testid="select-year">
                  <SelectValue placeholder="Selecione o ano" />
                </SelectTrigger>
                <SelectContent>
                  {yearsData?.years.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Turno</label>
              <Select value={selectedRound} onValueChange={setSelectedRound}>
                <SelectTrigger className="rounded-full" data-testid="select-round">
                  <SelectValue placeholder="Selecione o turno" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1º Turno</SelectItem>
                  <SelectItem value="2">2º Turno</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Cargo</label>
              <Select value={selectedPosition} onValueChange={setSelectedPosition}>
                <SelectTrigger className="rounded-full" data-testid="select-position">
                  <SelectValue placeholder="Selecione o cargo" />
                </SelectTrigger>
                <SelectContent>
                  {positionsData?.positions.map((pos) => (
                    <SelectItem key={pos.value} value={pos.value}>
                      {pos.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Estado</label>
              <Select value={selectedState} onValueChange={setSelectedState}>
                <SelectTrigger className="rounded-full" data-testid="select-state">
                  <SelectValue placeholder="Todos os estados" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todos os estados</SelectItem>
                  {statesData?.states.map((state) => (
                    <SelectItem key={state.value} value={state.value}>
                      {state.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 flex items-end">
              <Button className="w-full rounded-full" variant="outline" data-testid="button-export">
                <Download className="w-4 h-4 mr-2" />
                Exportar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : results?.candidates ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {results.candidates.slice(0, 3).map((candidate: any, index: number) => (
              <Card key={candidate.number} className={index === 0 ? "border-primary border-2" : ""}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{index + 1}º Lugar</CardTitle>
                    {index === 0 && <Trophy className="w-5 h-5 text-primary" />}
                  </div>
                  <CardDescription>{candidate.party}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="font-bold text-2xl text-foreground" data-testid={`text-candidate-${index}`}>
                    {candidate.name}
                  </p>
                  <p className="text-sm text-muted-foreground">Número: {candidate.number}</p>
                  <div className="pt-2">
                    <p className="text-3xl font-bold text-primary">{formatNumber(candidate.votes)}</p>
                    <p className="text-sm text-muted-foreground">votos ({candidate.percentage.toFixed(2)}%)</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Votação por Candidato</CardTitle>
                <CardDescription>Comparativo de votos recebidos</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                    <YAxis />
                    <Tooltip 
                      formatter={(value: number) => formatNumber(value)}
                      contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)' }}
                    />
                    <Legend />
                    <Bar dataKey="Votos" fill={COLORS[0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Distribuição de Votos</CardTitle>
                <CardDescription>Proporção percentual por candidato</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: number) => formatNumber(value)}
                      contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-muted/50">
            <CardHeader>
              <CardTitle className="text-sm">Informações</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-1">
              <p>📊 Dados oficiais do Tribunal Superior Eleitoral (TSE)</p>
              <p>📅 Ano: {selectedYear} | Turno: {selectedRound}º | Cargo: {positionsData?.positions.find(p => p.value === selectedPosition)?.label}</p>
              <p>🗺️ Abrangência: {selectedState ? statesData?.states.find(s => s.value === selectedState)?.label : 'Nacional'}</p>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p>Selecione os filtros acima para visualizar os resultados</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
