import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { ArrowLeft, Users2, CheckCircle2, XCircle } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

const COLORS = ['#40E0D0', '#48D1CC', '#20B2AA', '#5F9EA0', '#008B8B', '#4682B4'];

export default function StatisticsElectorate() {
  const [selectedYear, setSelectedYear] = useState("2024");
  const [selectedState, setSelectedState] = useState("");

  const { data: yearsData } = useQuery<{ years: number[] }>({
    queryKey: ["/api/tse/available-years"],
  });

  const { data: statesData } = useQuery<{ states: Array<{ value: string; label: string }> }>({
    queryKey: ["/api/tse/states"],
  });

  const { data: electorate, isLoading } = useQuery({
    queryKey: ["/api/tse/electorate", selectedYear, selectedState],
    enabled: !!selectedYear,
  });

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('pt-BR').format(num);
  };

  const biometryData = [
    { name: 'Com Biometria', value: electorate?.withBiometry || 0 },
    { name: 'Sem Biometria', value: electorate?.withoutBiometry || 0 },
  ];

  const obligatoryData = [
    { name: 'Obrigatório', value: electorate?.mandatory || 0 },
    { name: 'Facultativo', value: electorate?.optional || 0 },
  ];

  const genderData = [
    { name: 'Masculino', value: electorate?.male || 0 },
    { name: 'Feminino', value: electorate?.female || 0 },
  ];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/statistics">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-foreground" data-testid="heading-electorate">
            Perfil do Eleitorado
          </h1>
          <p className="text-muted-foreground">
            Análise demográfica e estatística do eleitorado brasileiro
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>Selecione os parâmetros para análise</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <label className="text-sm font-medium">Estado</label>
              <Select value={selectedState} onValueChange={setSelectedState}>
                <SelectTrigger className="rounded-full" data-testid="select-state">
                  <SelectValue placeholder="Nacional (todos os estados)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Nacional</SelectItem>
                  {statesData?.states.map((state) => (
                    <SelectItem key={state.value} value={state.value}>
                      {state.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : electorate ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total de Eleitores
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Users2 className="w-5 h-5 text-primary" />
                  <p className="text-3xl font-bold text-foreground" data-testid="text-total">
                    {formatNumber(electorate.total)}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Com Biometria
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                  <div>
                    <p className="text-2xl font-bold text-foreground">
                      {formatNumber(electorate.withBiometry)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {((electorate.withBiometry / electorate.total) * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Voto Obrigatório
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                  <div>
                    <p className="text-2xl font-bold text-foreground">
                      {formatNumber(electorate.mandatory)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {((electorate.mandatory / electorate.total) * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Voto Facultativo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-2xl font-bold text-foreground">
                      {formatNumber(electorate.optional)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {((electorate.optional / electorate.total) * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Biometria</CardTitle>
                <CardDescription>Distribuição por cadastro biométrico</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={biometryData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                      outerRadius={90}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {biometryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index]} />
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

            <Card>
              <CardHeader>
                <CardTitle>Obrigatoriedade</CardTitle>
                <CardDescription>Voto obrigatório vs facultativo</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={obligatoryData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                      outerRadius={90}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {obligatoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index + 2]} />
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

            <Card>
              <CardHeader>
                <CardTitle>Gênero</CardTitle>
                <CardDescription>Distribuição por gênero</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={genderData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip 
                      formatter={(value: number) => formatNumber(value)}
                      contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)' }}
                    />
                    <Bar dataKey="value" fill={COLORS[4]} />
                  </BarChart>
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
              <p>📅 Ano de referência: {selectedYear}</p>
              <p>🗺️ Abrangência: {selectedState ? statesData?.states.find(s => s.value === selectedState)?.label : 'Nacional (todos os estados)'}</p>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p>Selecione os filtros acima para visualizar os dados</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
